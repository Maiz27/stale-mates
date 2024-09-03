/* eslint-disable @typescript-eslint/no-explicit-any */

import { writable, type Writable } from 'svelte/store';

type MessageHandler = (data: any) => void;

export class WebSocketManager {
	private ws: WebSocket;
	private messageHandlers: Map<string, MessageHandler> = new Map();
	connected: Writable<boolean> = writable(false);

	constructor(url: string) {
		this.ws = new WebSocket(url);
		this.setupEventListeners();
	}

	private setupEventListeners() {
		this.ws.onopen = () => {
			console.log('WebSocket connection established');
			this.connected.set(true);
		};

		this.ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log('Received message:', data);
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
			this.connected.set(false);
		};
	}

	sendMessage(message: any) {
		if (this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		} else {
			console.error('WebSocket is not open. ReadyState:', this.ws.readyState);
		}
	}

	addMessageHandler(type: string, handler: MessageHandler) {
		this.messageHandlers.set(type, handler);
	}

	close() {
		if (this.ws.readyState === WebSocket.OPEN) {
			this.ws.close();
		}
	}
}
