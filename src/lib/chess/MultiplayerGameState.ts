import { Chess, type Move } from 'chess.js';
import { writable, type Writable } from 'svelte/store';
import { GameState } from './GameState';
import type { Color } from 'chessground/types';
import type { ChessMove } from './types';

export interface MultiplayerGameStateOptions {
	player: Color;
	websocket: WebSocket;
}

export class MultiplayerGameState extends GameState {
	private ws: WebSocket;
	opponentConnected: Writable<boolean> = writable(false);

	constructor({ player, websocket }: MultiplayerGameStateOptions) {
		super('pvp', player);
		this.ws = websocket;
		this.setupWebSocketListeners();
	}

	setDifficulty(): void {
		console.log('Difficulty settings are not applicable in multiplayer mode');
	}

	updateSettings(): void {
		console.log('Some settings may not apply in multiplayer mode');
	}

	undoMove(): void {
		console.log('Undo is not available in multiplayer mode');
	}

	async getHint(): Promise<ChessMove | null> {
		console.log('Hints are not available in multiplayer mode');
		return null;
	}

	protected onMove(move: Move): void {
		this.ws.send(
			JSON.stringify({
				type: 'move',
				move: { from: move.from, to: move.to, promotion: move.promotion }
			})
		);
	}

	private setupWebSocketListeners() {
		this.ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			this.handleWebSocketMessage(data);
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private handleWebSocketMessage(data: any) {
		switch (data.type) {
			case 'opponentMove':
				this.handleOpponentMove(data.move);
				break;
			case 'opponentJoined':
				this.opponentConnected.set(true);
				break;
			case 'gameStart':
				this.started.set(true);
				break;
		}
	}

	private updateFromServer(serverState: Chess) {
		this.chess = serverState;
		this.updateGameState();
	}

	private handleOpponentMove(move: ChessMove) {
		const chessMove = this.chess.move(move);
		if (chessMove) {
			this.moveHistory.update((history) => [...history, move]);
			this.updateGameState();
			this.determineMoveType(chessMove);
		}
	}
}
