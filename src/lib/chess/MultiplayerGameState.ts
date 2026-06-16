import { writable, type Writable } from 'svelte/store';
import { GameState } from './GameState';
import type { Color } from 'chessground/types';
import type { ChessMove, ClockSnapshot, GameOver, GameOverReason, TimeControl } from './types';
import { WebSocketManager, type ConnectionStatus } from '../websocket/WebSocketManager';
import { AddItemToCookies, GetItemFromCookies } from '$lib/utils';
import { PLAYER_ID_EXPIRATION } from '$lib/constants';

export interface MultiplayerGameStateOptions {
	player: Color;
	roomId: string;
}

export class MultiplayerGameState extends GameState {
	private wsManager: WebSocketManager;

	// Display-only clock interpolation. The SERVER is authoritative for time and
	// flag-fall; this client never decides a timeout — it renders the latest
	// snapshot and waits for the server's `gameOver`.
	private clockSnapshot: ClockSnapshot | null = null;
	private clockTick: number | null = null;
	private serverOffset = 0; // serverTime - local Date.now(), to align the snapshot

	opponentConnected: Writable<boolean> = writable(false);
	connectionStatus: Writable<ConnectionStatus> = writable('connecting');
	isUnlimited: Writable<boolean> = writable(true);
	whiteTime: Writable<number> = writable(0);
	blackTime: Writable<number> = writable(0);
	rematchOffer: Writable<boolean> = writable(false);
	roomId: string;

	constructor({ player, roomId }: MultiplayerGameStateOptions) {
		super('pvp', player);
		this.roomId = roomId;
		// Resolve the URL lazily so a reconnect re-reads the playerId cookie that
		// the first `connected` message stored — the server then rebinds our seat
		// instead of treating us as a brand-new (rejected) join.
		this.wsManager = new WebSocketManager(() =>
			this.constructWebSocketUrl(player, roomId, GetItemFromCookies(`${this.roomId}-playerId`))
		);
		this.wsManager.onStatus((status) => this.connectionStatus.set(status));
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
		this.wsManager.addMessageHandler('clock', (data) => this.applyClockSnapshot(data.clock));
		this.wsManager.addMessageHandler('gameOver', (data) => this.handleGameOver(data));
		this.wsManager.addMessageHandler('gameState', (data) => this.handleGameState(data));
		this.wsManager.addMessageHandler('rematchOffer', () => this.rematchOffer.set(true));
		this.wsManager.addMessageHandler('rematchAccepted', (data) => this.handleRematchAccepted(data));
	}

	newGame() {
		super.newGame();
	}

	makeMove(move: ChessMove): boolean {
		const result = super.makeMove(move);
		if (result) {
			// Optimistic local apply already happened in super.makeMove; just tell
			// the server. The authoritative clock comes back via a `clock` snapshot.
			this.wsManager.sendMessage({
				type: 'move',
				move: { from: move.from, to: move.to, promotion: move.promotion }
			});
		}
		return result;
	}

	endGame() {
		super.endGame();
		this.stopClockTick();
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

	offerRematch() {
		this.wsManager.sendMessage({ type: 'offerRematch' });
	}

	acceptRematch() {
		this.wsManager.sendMessage({ type: 'acceptRematch' });
	}

	resign() {
		this.wsManager.sendMessage({ type: 'resign' });
	}

	close() {
		this.wsManager.close();
	}

	destroy() {
		this.stopClockTick();
		this.close();
		super.destroy();
	}

	private handleRematchAccepted(data: { fen: string; turn: Color; timeControl: TimeControl; clock?: ClockSnapshot }) {
		this.rematchOffer.set(false);
		this.gameOver.set({ isOver: false, winner: null });
		this.chess.load(data.fen);
		this.turn.set(data.turn);
		this.moveHistory.set([]);
		this.initializeClock(data.timeControl, data.clock);
		this.started.set(true);
		this.audioCue.set('game-start');
		this.updateGameState();
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

	private handleGameStart(data: {
		fen: string;
		turn: Color;
		timeControl: TimeControl;
		clock?: ClockSnapshot;
	}) {
		this.chess.load(data.fen);
		this.turn.set(data.turn);
		this.initializeClock(data.timeControl, data.clock);
		this.started.set(true);
		this.updateGameState();
	}

	private handleOpponentMove(move: ChessMove) {
		super.makeMove(move);
	}

	private initializeClock(timeControl: TimeControl, clock?: ClockSnapshot) {
		this.isUnlimited.set(timeControl.isUnlimited);
		if (timeControl.isUnlimited) {
			this.stopClockTick();
			return;
		}
		if (clock) {
			this.applyClockSnapshot(clock);
		} else {
			this.whiteTime.set(timeControl.initial);
			this.blackTime.set(timeControl.initial);
		}
	}

	/** Adopt a server clock snapshot and (re)start the display interpolation. */
	private applyClockSnapshot(snapshot: ClockSnapshot | undefined) {
		if (!snapshot) return;
		this.clockSnapshot = snapshot;
		this.serverOffset = snapshot.serverTime - Date.now();
		this.startClockTick();
	}

	/** Render the latest snapshot, deducting live elapsed time from the running side. */
	private renderClock() {
		const snap = this.clockSnapshot;
		if (!snap) return;

		const now = Date.now() + this.serverOffset;
		const elapsed = now - snap.serverTime;
		const whiteMs = snap.running === 'white' ? snap.whiteMs - elapsed : snap.whiteMs;
		const blackMs = snap.running === 'black' ? snap.blackMs - elapsed : snap.blackMs;

		// Display only — clamp at zero and NEVER declare game-over here.
		this.whiteTime.set(Math.max(0, whiteMs / 1000));
		this.blackTime.set(Math.max(0, blackMs / 1000));
	}

	private startClockTick() {
		this.stopClockTick();
		this.renderClock();
		// Only animate when a clock is actually running.
		if (this.clockSnapshot && this.clockSnapshot.running !== null) {
			this.clockTick = window.setInterval(() => this.renderClock(), 250);
		}
	}

	private stopClockTick() {
		if (this.clockTick) {
			clearInterval(this.clockTick);
			this.clockTick = null;
		}
	}

	private setGameOver(winner: Color | 'draw' | null, reason?: GameOverReason) {
		const gameOver: GameOver = { isOver: true, winner, reason };
		this.gameOver.set(gameOver);
	}

	private handleGameOver(data: {
		winner?: Color | 'draw' | null;
		reason?: GameOverReason;
		clock?: ClockSnapshot;
	}) {
		// Freeze the display on the final authoritative clock, then stop ticking.
		if (data.clock) {
			this.clockSnapshot = data.clock;
			this.serverOffset = data.clock.serverTime - Date.now();
			this.renderClock();
		}
		this.stopClockTick();
		this.setGameOver(data.winner ?? null, data.reason);
		this.audioCue.set('game-end');
		this.updateGameState();
	}

	private handleGameState(data: {
		started: boolean;
		fen: string;
		turn: Color;
		clock?: ClockSnapshot;
		timeControl?: TimeControl;
	}) {
		this.chess.load(data.fen);
		this.fen.set(data.fen);
		this.turn.set(data.turn);
		if (data.timeControl) {
			this.initializeClock(data.timeControl, data.clock);
		} else if (data.clock) {
			this.applyClockSnapshot(data.clock);
		}
		this.started.set(data.started);
		this.opponentConnected.set(true);
		this.updateGameState();
	}
}
