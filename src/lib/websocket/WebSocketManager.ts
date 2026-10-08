import type {
	ClientMessage,
	CloseReason,
	ServerMessage,
	ServerMessageOf,
	ServerMessageType
} from '$lib/chess/protocol';

/**
 * - `rejected`: the server refused the join/reconnect, or we gave up reaching it
 *   (see {@link Rejection} for why) — terminal, retrying would just hammer it.
 * - `replaced`: this seat was opened by a newer connection (another tab) — terminal.
 */
export type ConnectionStatus =
	'connecting' | 'open' | 'reconnecting' | 'closed' | 'rejected' | 'replaced';

/** Close code the server uses when a newer socket takes over this seat. */
export const CLOSE_REPLACED = 4000;
/** Close code for "too many connections from your IP" (1013 Try Again Later). */
export const CLOSE_TRY_AGAIN_LATER = 1013;

/**
 * Why the server refused us (with status `rejected`):
 * - `notFound`: the room is gone, or the seat token is wrong/spent.
 * - `rateLimited`: this connection sent too many messages.
 * - `tooManyConnections`: too many open connections from this IP.
 * - `origin`: this site isn't allowed to talk to the game server.
 * - `other`: any other refusal (e.g. no join frame in time).
 * - `unconfigured`: this build has no game server URL (no connection attempted).
 * - `unreachable`: not a refusal — reconnecting kept failing (server down, or
 *   closing every connection, e.g. 1011) for the whole retry budget (CR2-7).
 */
export type Rejection =
	| 'notFound'
	| 'rateLimited'
	| 'tooManyConnections'
	| 'origin'
	| 'other'
	| 'unconfigured'
	| 'unreachable';

/** How long to keep reconnecting through one outage before giving up. */
export const DEFAULT_RECONNECT_BUDGET_MS = 2 * 60_000;

const REJECTIONS: Partial<Record<CloseReason, Rejection>> = {
	'Invalid game room': 'notFound',
	'Unable to join game': 'notFound',
	'Rate limit exceeded': 'rateLimited',
	'Origin not allowed': 'origin',
	'Too many connections': 'tooManyConnections'
};

/** Classify a close frame as a terminal refusal, or null for a drop worth reconnecting after. */
export function rejectionFor(code: number, reason: string): Rejection | null {
	if (code === CLOSE_TRY_AGAIN_LATER) return 'tooManyConnections';
	if (code !== 1008) return null;
	return REJECTIONS[reason as CloseReason] ?? 'other';
}

type StatusHandler = (status: ConnectionStatus, rejection: Rejection | null) => void;
/** A handler bound to one server message type, receiving that exact variant. */
type ServerMessageHandler<T extends ServerMessageType> = (data: ServerMessageOf<T>) => void;

/**
 * Manages a single game WebSocket with automatic reconnect (exponential backoff
 * + jitter). On every (re)connect the `hello` frame (the seat `join`) is sent
 * first and re-evaluated each time, so a reconnect presents the rotated seat
 * token the server handed out — that's what rebinds us to our existing seat.
 */
export class WebSocketManager {
	private ws: WebSocket | null = null;
	// Stored type-erased; `addMessageHandler` is the type-safe door in, and the
	// dispatch below only ever hands a handler the variant matching its key.
	private messageHandlers: Map<ServerMessageType, (data: ServerMessage) => void> = new Map();
	private urlProvider: () => string;
	private statusHandler: StatusHandler | null = null;
	private currentStatus: ConnectionStatus = 'connecting';
	private rejection: Rejection | null = null;

	private intentionallyClosed = false;
	private reconnectAttempts = 0;
	// When the current outage began: the first drop since the server last sent us
	// a frame. Reset by a frame, not by `open` — a server that accepts the upgrade
	// and then closes (1011) would otherwise be retried every 500 ms forever.
	private outageStartedAt: number | null = null;
	private readonly reconnectBudgetMs: number;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly baseReconnectDelay = 500;
	private readonly maxReconnectDelay = 10_000;

	private hello: (() => ClientMessage | null) | null;

	/**
	 * @param hello Frame sent first on every (re)connect — the seat `join`, so the
	 *   credential travels in the message body, never in the URL (audit C3).
	 * @param reconnectBudgetMs How long one outage may last before reconnecting
	 *   stops with `rejected` / `unreachable`.
	 */
	constructor(
		url: string | (() => string),
		options: { hello?: () => ClientMessage | null; reconnectBudgetMs?: number } = {}
	) {
		this.urlProvider = typeof url === 'string' ? () => url : url;
		this.hello = options.hello ?? null;
		this.reconnectBudgetMs = options.reconnectBudgetMs ?? DEFAULT_RECONNECT_BUDGET_MS;
		this.connect();
	}

	private connect() {
		this.setStatus('connecting');
		this.ws = new WebSocket(this.urlProvider());
		this.setupEventListeners();
	}

	private setupEventListeners() {
		const ws = this.ws;
		if (!ws) return;
		// Events from a socket we've already moved on from must not drive state.
		const isCurrent = () => this.ws === ws;

		ws.onopen = () => {
			if (!isCurrent()) return;
			const hello = this.hello?.();
			if (hello) ws.send(JSON.stringify(hello));
			this.setStatus('open');
		};

		ws.onmessage = (event) => {
			if (!isCurrent()) return;
			let data: ServerMessage;
			try {
				data = JSON.parse(event.data) as ServerMessage;
			} catch {
				console.error('Dropping malformed server frame');
				return;
			}
			if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
			// The server is talking to us: the connection works, so any outage is over.
			this.reconnectAttempts = 0;
			this.outageStartedAt = null;
			const handler = this.messageHandlers.get(data.type);
			if (handler) {
				handler(data);
			} else {
				console.warn(`No handler for message type: ${data.type}`);
			}
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};

		ws.onclose = (event) => {
			if (!isCurrent()) return;
			if (this.intentionallyClosed) {
				this.setStatus('closed');
				return;
			}
			// 1008 (policy violation) / 1013 (too many connections) = the server
			// refused us; the close reason says why (CR-12). Retrying would just
			// hammer it, so these are terminal.
			const rejection = rejectionFor(event.code, event.reason);
			if (rejection) {
				this.rejection = rejection;
				this.setStatus('rejected');
				return;
			}
			// Another connection took over this seat; fighting it would ping-pong.
			if (event.code === CLOSE_REPLACED) {
				this.setStatus('replaced');
				return;
			}
			this.scheduleReconnect();
		};
	}

	private scheduleReconnect() {
		if (this.reconnectTimer !== null) return;

		const now = Date.now();
		this.outageStartedAt ??= now;
		if (now - this.outageStartedAt >= this.reconnectBudgetMs) {
			this.rejection = 'unreachable';
			this.setStatus('rejected');
			return;
		}

		const delay = Math.min(
			this.maxReconnectDelay,
			this.baseReconnectDelay * 2 ** this.reconnectAttempts
		);
		const jitter = delay * 0.2 * Math.random();
		this.reconnectAttempts++;
		this.setStatus('reconnecting');

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay + jitter);
	}

	private setStatus(status: ConnectionStatus) {
		this.currentStatus = status;
		this.statusHandler?.(status, status === 'rejected' ? this.rejection : null);
	}

	/** Returns true if the frame was sent, false if the socket wasn't open. */
	sendMessage(message: ClientMessage): boolean {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
			return true;
		}
		console.error('WebSocket is not open. ReadyState:', this.ws?.readyState);
		return false;
	}

	addMessageHandler<T extends ServerMessageType>(type: T, handler: ServerMessageHandler<T>) {
		// Safe: dispatch only invokes this handler for messages whose `type === T`.
		this.messageHandlers.set(type, handler as (data: ServerMessage) => void);
	}

	onStatus(handler: StatusHandler) {
		this.statusHandler = handler;
		// Replay the current status so a subscriber that registered after the
		// socket already opened doesn't miss it.
		handler(this.currentStatus, this.currentStatus === 'rejected' ? this.rejection : null);
	}

	close() {
		this.intentionallyClosed = true;
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.ws?.close();
	}
}
