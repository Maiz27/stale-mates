/* eslint-disable @typescript-eslint/no-explicit-any */

type MessageHandler = (data: any) => void;
export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
type StatusHandler = (status: ConnectionStatus) => void;

/**
 * Manages a single game WebSocket with automatic reconnect (exponential backoff
 * + jitter). The URL is resolved lazily via a provider so reconnects can pick up
 * the `playerId` persisted after the first `connected` message — that's what
 * lets the server rebind us to our existing seat (reconnectPlayer) rather than
 * treating us as a fresh join.
 */
export class WebSocketManager {
	private ws: WebSocket | null = null;
	private messageHandlers: Map<string, MessageHandler> = new Map();
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
			const data = JSON.parse(event.data);
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
	sendMessage(message: any): boolean {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
			return true;
		}
		console.error('WebSocket is not open. ReadyState:', this.ws?.readyState);
		return false;
	}

	addMessageHandler(type: string, handler: MessageHandler) {
		this.messageHandlers.set(type, handler);
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
