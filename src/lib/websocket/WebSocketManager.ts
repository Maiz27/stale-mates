import type {
	ClientMessage,
	ServerMessage,
	ServerMessageOf,
	ServerMessageType
} from '$lib/chess/protocol';

/**
 * - `rejected`: the server refused the join/reconnect (room gone, full, or a bad
 *   seat) — terminal, retrying would just hammer it.
 * - `replaced`: this seat was opened by a newer connection (another tab) — terminal.
 */
export type ConnectionStatus =
	'connecting' | 'open' | 'reconnecting' | 'closed' | 'rejected' | 'replaced';

/** Close code the server uses when a newer socket takes over this seat. */
export const CLOSE_REPLACED = 4000;
type StatusHandler = (status: ConnectionStatus) => void;
/** A handler bound to one server message type, receiving that exact variant. */
type ServerMessageHandler<T extends ServerMessageType> = (data: ServerMessageOf<T>) => void;

/**
 * Manages a single game WebSocket with automatic reconnect (exponential backoff
 * + jitter). The URL is resolved lazily via a provider so reconnects can pick up
 * the `playerId` persisted after the first `connected` message — that's what
 * lets the server rebind us to our existing seat (reconnectPlayer) rather than
 * treating us as a fresh join.
 */
export class WebSocketManager {
	private ws: WebSocket | null = null;
	// Stored type-erased; `addMessageHandler` is the type-safe door in, and the
	// dispatch below only ever hands a handler the variant matching its key.
	private messageHandlers: Map<ServerMessageType, (data: ServerMessage) => void> = new Map();
	private urlProvider: () => string;
	private statusHandler: StatusHandler | null = null;
	private currentStatus: ConnectionStatus = 'connecting';

	private intentionallyClosed = false;
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly baseReconnectDelay = 500;
	private readonly maxReconnectDelay = 10_000;

	constructor(url: string | (() => string)) {
		this.urlProvider = typeof url === 'string' ? () => url : url;
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
			this.reconnectAttempts = 0;
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
			// 1008 (policy violation) = the server rejected the join/reconnect
			// (e.g. the room is gone or full). Retrying would just hammer it.
			if (event.code === 1008) {
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
		this.statusHandler?.(status);
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
		handler(this.currentStatus);
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
