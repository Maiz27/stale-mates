import type { ClientMessage, ServerMessage, ServerMessageOf, ServerMessageType } from '$lib/chess/protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
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
		if (!this.ws) return;

		this.ws.onopen = () => {
			this.reconnectAttempts = 0;
			this.setStatus('open');
		};

		this.ws.onmessage = (event) => {
			const data = JSON.parse(event.data) as ServerMessage;
			const handler = this.messageHandlers.get(data.type);
			if (handler) {
				handler(data);
			} else {
				console.warn(`No handler for message type: ${data.type}`);
			}
		};

		this.ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};

		this.ws.onclose = (event) => {
			if (this.intentionallyClosed) {
				this.setStatus('closed');
				return;
			}
			// 1008 (policy violation) = the server rejected the join/reconnect
			// (e.g. the room is gone or full). Retrying would just hammer it.
			if (event.code === 1008) {
				this.setStatus('closed');
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
