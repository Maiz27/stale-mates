import { GameModel } from './GameModel';
import type { Color } from 'chessground/types';
import type { ChessMove, ClockSnapshot, GameOverReason, TimeControl } from './types';
import { WebSocketManager } from '../websocket/WebSocketManager';
import { AddItemToCookies, GetItemFromCookies } from '$lib/utils';
import { PLAYER_ID_EXPIRATION } from '$lib/constants';

export interface MultiplayerGameStateOptions {
	player: Color;
	roomId: string;
}

export class MultiplayerGameState extends GameModel {
	private wsManager: WebSocketManager;

	// Display-only clock interpolation. The SERVER is authoritative for time and
	// flag-fall; this client never decides a timeout — it renders the latest
	// snapshot and waits for the server's `gameOver`.
	private clockSnapshot: ClockSnapshot | null = null;
	private clockTick: number | null = null;
	private serverOffset = 0; // serverTime - local Date.now(), to align the snapshot
	private unlimited = true; // mirrors the active time control for clock patches

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
		this.wsManager.onStatus((status) => this.patch({ connectionStatus: status }));
		this.setupMessageHandlers();
	}

	private constructWebSocketUrl(player: Color, roomId: string, playerId: string | null): string {
		// Encode values that originate from the page URL / cookies so stray special
		// characters can't break or inject into the query string.
		const baseUrl = `${import.meta.env.VITE_API_WS_URL}/game/join?id=${encodeURIComponent(
			roomId
		)}&color=${player}`;
		return playerId ? `${baseUrl}&playerId=${encodeURIComponent(playerId)}` : baseUrl;
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
		this.wsManager.addMessageHandler('rematchOffer', () => this.patch({ rematchOffer: true }));
		this.wsManager.addMessageHandler('rematchAccepted', (data) => this.handleRematchAccepted(data));
	}

	makeMove(move: ChessMove): boolean {
		const result = super.makeMove(move);
		if (result) {
			// Optimistic local apply already happened in super.makeMove; just tell
			// the server. The authoritative clock comes back via a `clock` snapshot.
			const sent = this.wsManager.sendMessage({
				type: 'move',
				move: { from: move.from, to: move.to, promotion: move.promotion }
			});
			if (!sent) {
				// The socket isn't open, so the server will never see this move.
				// Roll back the optimistic apply; reconnect will resync from server truth.
				this.core.undo();
				this.patch({ moveHistory: this.snapshot().moveHistory.slice(0, -1) });
				this.updateGameState();
				return false;
			}
		}
		return result;
	}

	endGame() {
		super.endGame();
		this.stopClockTick();
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

	private handleRematchAccepted(data: {
		fen: string;
		turn: Color;
		timeControl: TimeControl;
		clock?: ClockSnapshot;
	}) {
		this.patch({ rematchOffer: false, gameOver: { isOver: false, winner: null } });
		this.core.load(data.fen);
		this.patch({ turn: data.turn, moveHistory: [], started: true });
		this.initializeClock(data.timeControl, data.clock);
		this.updateGameState();
	}

	private handleOpponentReconnected() {
		this.patch({ opponentConnected: true });
	}

	private handleConnected(playerId: string) {
		AddItemToCookies({
			key: `${this.roomId}-playerId`,
			value: playerId,
			expiration: PLAYER_ID_EXPIRATION
		});
	}

	private handleOpponentJoined() {
		this.patch({ opponentConnected: true });
	}

	private handleGameStart(data: {
		fen: string;
		turn: Color;
		timeControl: TimeControl;
		clock?: ClockSnapshot;
	}) {
		this.core.load(data.fen);
		this.patch({ turn: data.turn, started: true });
		this.initializeClock(data.timeControl, data.clock);
		this.updateGameState();
	}

	private handleOpponentMove(move: ChessMove) {
		// Apply locally only; bypass our own `makeMove` so we don't echo it back.
		super.makeMove(move);
	}

	private initializeClock(timeControl: TimeControl, clock?: ClockSnapshot) {
		this.unlimited = timeControl.isUnlimited;
		if (timeControl.isUnlimited) {
			this.stopClockTick();
			this.patch({ clock: { isUnlimited: true, myClock: 0, opponentClock: 0 } });
			return;
		}
		if (clock) {
			this.applyClockSnapshot(clock);
		} else {
			this.setClock(timeControl.initial, timeControl.initial);
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
		this.setClock(Math.max(0, whiteMs / 1000), Math.max(0, blackMs / 1000));
	}

	/** Project white/black seconds into the player-relative clock view. */
	private setClock(whiteSeconds: number, blackSeconds: number) {
		this.patch({
			clock: {
				isUnlimited: this.unlimited,
				myClock: this.player === 'white' ? whiteSeconds : blackSeconds,
				opponentClock: this.player === 'white' ? blackSeconds : whiteSeconds
			}
		});
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
		this.patch({ gameOver: { isOver: true, winner: data.winner ?? null, reason: data.reason } });
		this.updateGameState();
	}

	private handleGameState(data: {
		started: boolean;
		fen: string;
		turn: Color;
		clock?: ClockSnapshot;
		timeControl?: TimeControl;
	}) {
		this.core.load(data.fen);
		this.patch({ turn: data.turn });
		if (data.timeControl) {
			this.initializeClock(data.timeControl, data.clock);
		} else if (data.clock) {
			this.applyClockSnapshot(data.clock);
		}
		this.patch({ started: data.started, opponentConnected: true });
		this.updateGameState();
	}
}
