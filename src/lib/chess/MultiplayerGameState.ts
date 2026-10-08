import { GameModel } from './GameModel';
import type { Color } from 'chessground/types';
import type { ChessMove, ClockSnapshot, GameOverReason, TimeControl } from './types';
import type { ServerMessageOf } from './protocol';
import type { ClientMessage } from './protocol';
import { WebSocketManager } from '../websocket/WebSocketManager';
import {
	clearRoomEnded,
	clearSeat,
	getSeatToken,
	markRoomEnded,
	setSeatToken,
	touchSeat
} from './seat';
import type { GameView } from './types';
import { apiUrls } from '../apiConfig';

/**
 * Whether the "Offer draw" control is live: a game in progress, no offer pending,
 * and the position has changed since my last offer (mirrors the server's rule,
 * which refuses a second offer at the same ply) (CR-4).
 */
export function canOfferDraw(view: GameView): boolean {
	return (
		view.started &&
		!view.gameOver.isOver &&
		view.drawOffer === null &&
		view.lastDrawOfferPly !== view.moveHistory.length
	);
}

/**
 * Opponent presence from a server frame: connected (servers that predate the
 * field omit it) or away, with when the win may be claimed on this clock.
 */
function presence(
	connected: boolean | undefined,
	graceMs: number | null | undefined
): Pick<GameView, 'opponentConnected' | 'opponentClaimableAt'> {
	const opponentConnected = connected ?? true;
	return {
		opponentConnected,
		opponentClaimableAt: !opponentConnected && graceMs != null ? Date.now() + graceMs : null
	};
}

/** The slice of {@link WebSocketManager} the game mode uses (lets tests inject a fake). */
export type GameSocket = Pick<
	WebSocketManager,
	'addMessageHandler' | 'sendMessage' | 'onStatus' | 'close'
>;

export interface MultiplayerGameStateOptions {
	roomId: string;
	/** Seat token; defaults to the one stored for this room in this tab. */
	token?: string | null;
	/** Factory for the socket; defaults to a real reconnecting {@link WebSocketManager}. */
	connect?: (url: string, hello: () => ClientMessage | null) => GameSocket;
	/**
	 * WebSocket base URL of the game server; defaults to this build's
	 * ({@link apiUrls}). `null` = not configured: no socket is opened and the view
	 * reports `rejected` / `unconfigured` (CR2-2).
	 */
	serverUrl?: string | null;
}

/** Stands in for the socket when there is no server to talk to. */
const unconfiguredSocket: GameSocket = {
	addMessageHandler() {},
	sendMessage: () => false,
	onStatus: (handler) => handler('rejected', 'unconfigured'),
	close() {}
};

export class MultiplayerGameState extends GameModel {
	private wsManager: GameSocket;

	// Display-only clock interpolation. The SERVER is authoritative for time and
	// flag-fall; this client never decides a timeout — it renders the latest
	// snapshot and waits for the server's `gameOver`.
	private clockSnapshot: ClockSnapshot | null = null;
	private clockTick: ReturnType<typeof setInterval> | null = null;
	private serverOffset = 0; // serverTime - local Date.now(), to align the snapshot
	private unlimited = true; // mirrors the active time control for clock patches
	private lowTimeThreshold = 0;
	private lowTimeWarned = false; // play the low-time cue once per game

	roomId: string;
	private token: string | null;

	constructor({ roomId, token, connect, serverUrl = apiUrls.ws }: MultiplayerGameStateOptions) {
		// Our colour is assigned by the server (`seat`); white is only a placeholder.
		super('pvp', 'white');
		this.roomId = roomId;
		this.token = token ?? getSeatToken(roomId);
		// The room id is public; the seat token goes in the first frame, never the URL.
		const url = `${serverUrl}/game/join?id=${encodeURIComponent(roomId)}`;
		// Re-evaluated on every reconnect so it presents the latest (rotated) token.
		const hello = (): ClientMessage | null =>
			this.token ? { type: 'join', token: this.token } : null;
		this.wsManager =
			serverUrl === null
				? unconfiguredSocket
				: connect
					? connect(url, hello)
					: new WebSocketManager(url, { hello });
		this.wsManager.onStatus((status, rejection) => {
			// The room is gone or the token is dead: don't keep offering it (CR-5),
			// but remember why, so a reload says so instead of "incomplete link" (CR3-7).
			if (rejection === 'notFound') {
				clearSeat(roomId);
				markRoomEnded(roomId);
			}
			this.patch({ connectionStatus: status, rejection });
		});
		this.setupMessageHandlers();
	}

	private setupMessageHandlers() {
		const ws = this.wsManager;
		ws.addMessageHandler('seat', (data) => this.handleSeat(data.color, data.token));
		ws.addMessageHandler('opponentMove', (data) => this.handleOpponentMove(data.move));
		ws.addMessageHandler('opponentJoined', () => {
			this.handleOpponentPresent();
			this.playCue('notify');
		});
		ws.addMessageHandler('opponentReconnected', () => this.handleOpponentPresent());
		ws.addMessageHandler('opponentDisconnected', (data) =>
			this.handleOpponentDisconnected(data.graceMs)
		);
		ws.addMessageHandler('gameStart', (data) => this.handleGameStart(data));
		ws.addMessageHandler('clock', (data) => this.applyClockSnapshot(data.clock));
		ws.addMessageHandler('gameOver', (data) => this.handleGameOver(data));
		ws.addMessageHandler('gameState', (data) => this.handleGameState(data));
		ws.addMessageHandler('rematchOffer', () => this.patch({ rematchOffer: true }));
		ws.addMessageHandler('drawOffer', () => {
			this.patch({ drawOffer: 'opponent' });
			this.playCue('notify');
		});
		ws.addMessageHandler('drawDeclined', () => {
			if (this.snapshot().drawOffer === 'mine') this.patch({ drawOffer: null });
		});
		ws.addMessageHandler('rematchAccepted', (data) => this.handleRematchAccepted(data));
	}

	makeMove(move: ChessMove): boolean {
		const result = super.makeMove(move);
		if (result) {
			touchSeat(this.roomId);
			// Moving instead of answering declines a pending offer (server does the same).
			if (this.snapshot().drawOffer === 'opponent') this.patch({ drawOffer: null });
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
		if (this.wsManager.sendMessage({ type: 'offerRematch' })) {
			this.patch({ myRematchOffer: true });
		}
	}

	acceptRematch() {
		if (this.wsManager.sendMessage({ type: 'acceptRematch' })) {
			this.patch({ myRematchOffer: true });
		}
	}

	resign() {
		this.wsManager.sendMessage({ type: 'resign' });
	}

	offerDraw() {
		const view = this.snapshot();
		if (!canOfferDraw(view)) return;
		if (this.wsManager.sendMessage({ type: 'offerDraw' })) {
			this.patch({ drawOffer: 'mine', lastDrawOfferPly: view.moveHistory.length });
		}
	}

	acceptDraw() {
		if (this.snapshot().drawOffer !== 'opponent') return;
		this.wsManager.sendMessage({ type: 'acceptDraw' });
	}

	declineDraw() {
		if (this.snapshot().drawOffer !== 'opponent') return;
		if (this.wsManager.sendMessage({ type: 'declineDraw' })) this.patch({ drawOffer: null });
	}

	/** Claim the win after the opponent has been gone past the grace period (server-verified). */
	claimVictory() {
		this.wsManager.sendMessage({ type: 'claimVictory' });
	}

	close() {
		this.wsManager.close();
	}

	destroy() {
		this.stopClockTick();
		this.close();
		super.destroy();
	}

	private handleRematchAccepted(data: ServerMessageOf<'rematchAccepted'>) {
		this.core.reset();
		// Colours swap on every rematch.
		if (data.color && data.color !== this.player) this.player = data.color;
		this.patch({
			player: this.player,
			rematchOffer: false,
			myRematchOffer: false,
			drawOffer: null,
			lastDrawOfferPly: null,
			gameOver: { isOver: false, winner: null },
			moveHistory: [],
			started: true,
			// The opponent may have left after offering; the grace restarts with the game (CR2-3).
			...presence(data.opponentConnected, data.opponentGraceMs)
		});
		this.lowTimeWarned = false;
		this.initializeClock(data.timeControl, data.clock);
		this.updateGameState();
		this.playCue('game-start');
	}

	private handleOpponentPresent() {
		this.patch({ opponentConnected: true, opponentClaimableAt: null });
	}

	private handleOpponentDisconnected(graceMs: number) {
		this.patch({ opponentConnected: false, opponentClaimableAt: Date.now() + graceMs });
	}

	/** The server seated us: adopt its colour and keep the rotated token for reconnects. */
	private handleSeat(color: Color, token: string) {
		this.token = token;
		setSeatToken(this.roomId, token);
		clearRoomEnded(this.roomId);
		if (color !== this.player) {
			this.player = color;
			this.patch({ player: color });
			if (this.clockSnapshot) this.renderClock();
		}
	}

	private handleGameStart(data: ServerMessageOf<'gameStart'>) {
		this.core.load(data.fen);
		// The opponent may already be gone (the creator closed the waiting room
		// before we joined): the server says so, with the grace time left (CR-3).
		this.patch({
			started: true,
			...presence(data.opponentConnected, data.opponentGraceMs),
			moveHistory: [],
			drawOffer: null,
			lastDrawOfferPly: null,
			gameOver: { isOver: false, winner: null }
		});
		this.lowTimeWarned = false;
		this.initializeClock(data.timeControl, data.clock);
		this.updateGameState();
		this.playCue('game-start');
	}

	private handleOpponentMove(move: ChessMove) {
		// Apply locally only; bypass our own `makeMove` so we don't echo it back.
		super.makeMove(move);
		// Keep the stored seat alive for as long as the game is being played.
		touchSeat(this.roomId);
	}

	private initializeClock(timeControl: TimeControl, clock?: ClockSnapshot) {
		this.unlimited = timeControl.isUnlimited;
		this.lowTimeThreshold = timeControl.lowTimeThreshold;
		if (timeControl.isUnlimited) {
			this.stopClockTick();
			this.patch({
				clock: { isUnlimited: true, myClock: 0, opponentClock: 0, lowTimeThreshold: 0 }
			});
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
		const mine = this.player === 'white' ? whiteSeconds : blackSeconds;
		if (
			!this.lowTimeWarned &&
			!this.unlimited &&
			this.clockSnapshot?.running === this.player &&
			mine > 0 &&
			mine <= this.lowTimeThreshold
		) {
			this.lowTimeWarned = true;
			this.playCue('low-time');
		}
		this.patch({
			clock: {
				isUnlimited: this.unlimited,
				myClock: this.player === 'white' ? whiteSeconds : blackSeconds,
				opponentClock: this.player === 'white' ? blackSeconds : whiteSeconds,
				lowTimeThreshold: this.lowTimeThreshold
			}
		});
	}

	private startClockTick() {
		this.stopClockTick();
		this.renderClock();
		// Only animate when a clock is actually running.
		if (this.clockSnapshot && this.clockSnapshot.running !== null) {
			this.clockTick = setInterval(() => this.renderClock(), 250);
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
		this.patch({
			gameOver: { isOver: true, winner: data.winner ?? null, reason: data.reason },
			rematchOffer: false,
			myRematchOffer: false,
			drawOffer: null
		});
		this.updateGameState();
		this.playCue('game-end');
	}

	/**
	 * Full resync from the server (on (re)connect or after a rejected move).
	 * Rebuilds the board by replaying the server's move list so the SAN list /
	 * PGN survive (`load(fen)` would wipe them), drops any rejected optimistic
	 * move, and adopts the server's result, rematch and presence state.
	 */
	private handleGameState(data: ServerMessageOf<'gameState'>) {
		const replayed = data.moves ? this.core.replay(data.moves) : false;
		if (!replayed || this.core.fen() !== data.fen) {
			// Fall back to the authoritative position (history is lost, but the board is right).
			this.core.load(data.fen);
		}

		if (data.timeControl) {
			this.initializeClock(data.timeControl, data.clock);
		} else if (data.clock) {
			this.applyClockSnapshot(data.clock);
		}

		const gameOver = data.gameOver
			? { isOver: true, winner: data.gameOver.winner, reason: data.gameOver.reason }
			: { isOver: false, winner: null };
		if (data.gameOver) this.stopClockTick();

		this.patch({
			started: data.started,
			moveHistory: this.core.moves(),
			gameOver,
			promotionMove: null,
			rematchOffer: data.rematch?.opponent ?? false,
			myRematchOffer: data.rematch?.mine ?? false,
			drawOffer: data.drawOffer ?? null,
			...presence(data.opponentConnected, data.opponentGraceMs)
		});
		this.updateGameState();
	}
}
