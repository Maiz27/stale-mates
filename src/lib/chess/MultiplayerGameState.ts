import { type Move } from 'chess.js';
import { get, writable, type Writable } from 'svelte/store';
import { GameState } from './GameState';
import type { Color } from 'chessground/types';
import type { ChessMove, GameOver, TimeControl } from './types';

export interface MultiplayerGameStateOptions {
	player: Color;
	websocket: WebSocket;
}

export class MultiplayerGameState extends GameState {
	private ws: WebSocket;
	private timer: number | null = null;
	private lastMoveTime: number | null = null;
	opponentConnected: Writable<boolean> = writable(false);
	isUnlimited: Writable<boolean> = writable(true);
	whiteTime: Writable<number> = writable(0);
	blackTime: Writable<number> = writable(0);
	rematchOffer: Writable<boolean> = writable(false);

	constructor({ player, websocket }: MultiplayerGameStateOptions) {
		super('pvp', player);
		this.ws = websocket;
		this.setupWebSocketListeners();
	}

	protected onMove(move: Move): void {
		this.ws.send(
			JSON.stringify({
				type: 'move',
				move: { from: move.from, to: move.to, promotion: move.promotion }
			})
		);
		this.updateTimer();
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
				this.endGame();
				this.initializeTimer(data.timeControl);
				this.started.set(true);
				break;
			case 'gameOver':
				this.handleGameOver(data);
				break;
			case 'gameState':
				this.handleGameState(data);
				break;
			case 'rematchOffer':
				this.rematchOffer.set(true);
				break;
		}
	}

	private handleOpponentMove(move: ChessMove) {
		const chessMove = this.chess.move(move);
		if (chessMove) {
			this.moveHistory.update((history) => [...history, move]);
			this.updateGameState();
			this.determineMoveType(chessMove);
			this.updateTimer();
		}
	}

	private initializeTimer(timeControl: TimeControl) {
		this.isUnlimited.set(timeControl.isUnlimited);
		if (!timeControl.isUnlimited) {
			this.whiteTime.set(timeControl.initial);
			this.blackTime.set(timeControl.initial);
			this.startTimer();
		}
	}

	private startTimer() {
		this.lastMoveTime = Date.now();
		this.timer = window.setInterval(() => {
			this.updateRemainingTime();
		}, 1000);
	}

	private stopTimer() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private updateTimer() {
		if (get(this.isUnlimited)) return;

		const now = Date.now();
		if (this.lastMoveTime) {
			const elapsedTime = (now - this.lastMoveTime) / 1000;
			const currentPlayerTime = this.chess.turn() === 'w' ? this.whiteTime : this.blackTime;
			currentPlayerTime.update((time) => Math.max(0, time - elapsedTime));
		}
		this.lastMoveTime = now;
	}

	private updateRemainingTime() {
		if (get(this.isUnlimited)) return;

		const currentPlayerTime = this.chess.turn() === 'w' ? this.whiteTime : this.blackTime;
		currentPlayerTime.update((time) => {
			const newTime = Math.max(0, time - 1);
			if (newTime === 0) {
				this.handleTimeOut();
			}
			return newTime;
		});
	}

	private handleTimeOut() {
		this.stopTimer();
		const loser = this.chess.turn();
		const winner = loser === 'w' ? 'black' : 'white';

		this.audioCue.set('game-end');

		const gameOver: GameOver = { isOver: true, winner };
		this.gameOver.set(gameOver);

		this.ws.send(
			JSON.stringify({
				type: 'gameOver',
				reason: 'timeout',
				winner
			})
		);

		this.updateGameState();

		console.log(`Game over. ${winner} wins on time.`);
	}

	private handleGameOver(data: { winner?: Color; reason?: string }) {
		this.stopTimer();
		const gameOver: GameOver = { isOver: true, winner: data.winner! };
		this.gameOver.set(gameOver);
		this.audioCue.set('game-end');
		this.updateGameState();
	}

	private handleGameState(data: {
		fen: string;
		turn: Color;
		whiteTime?: number;
		blackTime?: number;
	}) {
		this.fen.set(data.fen);
		this.turn.set(data.turn);
		if (data.whiteTime !== undefined) this.whiteTime.set(data.whiteTime);
		if (data.blackTime !== undefined) this.blackTime.set(data.blackTime);
	}

	offerRematch() {
		this.ws.send(JSON.stringify({ type: 'offerRematch' }));
	}

	acceptRematch() {
		this.ws.send(JSON.stringify({ type: 'acceptRematch' }));
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
}
