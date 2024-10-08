/* eslint-disable @typescript-eslint/no-explicit-any */

type MessageHandler = (data: any) => void;

export class WebSocketManager {
	private ws: WebSocket;
	private messageHandlers: Map<string, MessageHandler> = new Map();
	private closeHandler: (() => void) | null = null;

	constructor(url: string) {
		this.ws = new WebSocket(url);
		this.setupEventListeners();
	}

	private setupEventListeners() {
		this.ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log('ws message', data);
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

		this.ws.onclose = () => {
			console.log('WebSocket connection closed');
			if (this.closeHandler) {
				this.closeHandler();
			}
		};
	}

	sendMessage(message: any) {
		if (this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		} else {
			console.error('WebSocket is not open. ReadyState:', this.ws.readyState);
		}
	}

	addMessageHandler(type: string, handler: (data: any) => void) {
		this.messageHandlers.set(type, handler);
	}

	close() {
		this.ws.close();
	}

	onClose(handler: () => void) {
		this.closeHandler = handler;
	}
}
