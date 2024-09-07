import { get, writable, type Writable } from 'svelte/store';
import { GameState } from './GameState';
import type { Color } from 'chessground/types';
import type { ChessMove, GameOver, TimeControl } from './types';
import { WebSocketManager } from '../websocket/WebSocketManager';
import { AddItemToCookies, GetItemFromCookies } from '$lib/utils';
import { PLAYER_ID_EXPIRATION } from '$lib/constants';

export interface MultiplayerGameStateOptions {
	player: Color;
	roomId: string;
}

export class MultiplayerGameState extends GameState {
	private wsManager: WebSocketManager;
	private timer: number | null = null;
	private lastMoveTime: number | null = null;

	opponentConnected: Writable<boolean> = writable(false);
	isUnlimited: Writable<boolean> = writable(true);
	whiteTime: Writable<number> = writable(0);
	blackTime: Writable<number> = writable(0);
	rematchOffer: Writable<boolean> = writable(false);
	roomId: string;

	constructor({ player, roomId }: MultiplayerGameStateOptions) {
		super('pvp', player);
		this.roomId = roomId;
		const playerId = GetItemFromCookies(`${this.roomId}-playerId`);
		const wsUrl = this.constructWebSocketUrl(player, roomId, playerId);
		this.wsManager = new WebSocketManager(wsUrl);
		this.setupMessageHandlers();
	}

	private constructWebSocketUrl(player: Color, roomId: string, playerId: string | null): string {
		const baseUrl = `${import.meta.env.VITE_API_WS_URL}/game/join?id=${roomId}&color=${player}`;
		return playerId ? `${baseUrl}&playerId=${playerId}` : baseUrl;
	}

	private setupMessageHandlers() {
		this.wsManager.addMessageHandler('connected', (data) => this.handleConnected(data.playerId));
		this.wsManager.addMessageHandler('opponentMove', (data) => this.handleOpponentMove(data.move));
		this.wsManager.addMessageHandler('opponentJoined', () => this.handleOpponentJoined());
		this.wsManager.addMessageHandler('opponentReconnected', () => this.handleOpponentReconnected());
		this.wsManager.addMessageHandler('gameStart', (data) => this.handleGameStart(data));
		this.wsManager.addMessageHandler('gameOver', (data) => this.handleGameOver(data));
		this.wsManager.addMessageHandler('gameState', (data) => this.handleGameState(data));
		this.wsManager.addMessageHandler('rematchOffer', () => this.rematchOffer.set(true));
		this.wsManager.addMessageHandler('rematchAccepted', () => this.handleRematchAccepted());
	}

	private handleRematchAccepted() {
		this.rematchOffer.set(false);

		this.endGame();
		this.newGame();
	}

	private handleOpponentReconnected() {
		this.opponentConnected.set(true);
	}

	private handleConnected(playerId: string) {
		AddItemToCookies({
			key: `${this.roomId}-playerId`,
			value: playerId,
			expiration: PLAYER_ID_EXPIRATION
		});
	}

	private handleOpponentJoined() {
		this.opponentConnected.set(true);
	}

	private handleGameStart(data: { fen: string; turn: Color; timeControl: TimeControl }) {
		this.endGame();
		this.chess.load(data.fen);
		this.turn.set(data.turn);
		this.initializeTimer(data.timeControl);
		this.started.set(true);
		this.updateGameState();
	}

	endGame() {
		super.endGame();
		this.stopTimer();
	}

	makeMove(move: ChessMove): boolean {
		const result = super.makeMove(move);
		if (result) {
			this.wsManager.sendMessage({
				type: 'move',
				move: { from: move.from, to: move.to, promotion: move.promotion }
			});
			this.updateTimer();
		}
		return result;
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
		this.timer = window.setInterval(() => this.updateRemainingTime(), 1000);
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
			this.updatePlayerTime(elapsedTime);
		}
		this.lastMoveTime = now;
	}

	private updatePlayerTime(elapsedTime: number) {
		const currentPlayerTime = this.chess.turn() === 'w' ? this.whiteTime : this.blackTime;
		currentPlayerTime.update((time) => Math.max(0, time - elapsedTime));
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
		this.setGameOver(winner);
		this.notifyGameOverDueToTimeout(winner);
		this.updateGameState();
	}

	private setGameOver(winner: Color) {
		const gameOver: GameOver = { isOver: true, winner };
		this.gameOver.set(gameOver);
	}

	private notifyGameOverDueToTimeout(winner: Color) {
		this.wsManager.sendMessage({
			type: 'gameOver',
			reason: 'timeout',
			winner
		});
	}

	private handleGameOver(data: { winner?: Color; reason?: string }) {
		this.stopTimer();
		this.setGameOver(data.winner!);
		this.audioCue.set('game-end');
		this.updateGameState();
	}

	private handleGameState(data: {
		fen: string;
		turn: Color;
		whiteTime?: number;
		blackTime?: number;
	}) {
		this.chess.load(data.fen);
		this.fen.set(data.fen);
		this.turn.set(data.turn);
		if (data.whiteTime !== undefined) this.whiteTime.set(data.whiteTime);
		if (data.blackTime !== undefined) this.blackTime.set(data.blackTime);
		this.started.set(true);
		this.opponentConnected.set(true);
		this.updateGameState();
	}

	offerRematch() {
		this.wsManager.sendMessage({ type: 'offerRematch' });
	}

	acceptRematch() {
		this.wsManager.sendMessage({ type: 'acceptRematch' });
	}

	setDifficulty(): void {
		console.warn('Difficulty settings are not applicable in multiplayer mode');
	}

	updateSettings(): void {
		console.warn('Some settings may not apply in multiplayer mode');
	}

	undoMove(): void {
		console.warn('Undo is not available in multiplayer mode');
	}

	async getHint(): Promise<ChessMove | null> {
		console.warn('Hints are not available in multiplayer mode');
		return null;
	}

	close() {
		this.wsManager.close();
	}
}
