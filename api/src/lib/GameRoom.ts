import WebSocket from 'ws';
import { Chess } from 'chess.js';
import { nanoid } from 'nanoid';
import {
	Player,
	TimeControl,
	TimeOption,
	Color,
	GameMessage,
	GameOverReason,
	GameResult
} from './types';
import { ClockMs, ClockSnapshot, buildSnapshot, clockAfterMove, remainingMs } from './clock';
import { gameOutcome, hasMatingMaterial } from './outcome';

/** How long a disconnected opponent has to come back before the other side may claim the win. */
export const DEFAULT_DISCONNECT_GRACE_MS = 60_000;

/** WS close code sent to a socket superseded by a newer connection for the same seat. */
export const CLOSE_REPLACED = 4000;

export interface GameRoomOptions {
	time: TimeOption;
	disconnectGraceMs?: number;
	/** Injectable clock for tests. */
	now?: () => number;
}

const opposite = (color: Color): Color => (color === 'white' ? 'black' : 'white');

export class GameRoom {
	id: string = nanoid();
	players: Player[] = [];
	gameStarted: boolean = false;
	// Wall-clock time (ms) the room was created.
	readonly createdAt: number;
	// Last time anyone joined/left/acted. The abandoned-room sweep measures its
	// grace period from here, so a room whose players all dropped a moment ago is
	// kept around for them to reconnect (audit SM-1.2).
	lastActivityAt: number;
	private chess: Chess = new Chess();
	private currentTurn: Color = 'white';
	// Keyed by seat colour so one client can't fill both slots (audit F5).
	private rematchOffers: Set<Color> = new Set();
	private timeControl: TimeControl;
	private readonly disconnectGraceMs: number;
	private readonly now: () => number;

	// Authoritative clock state (ms). The server is the single source of truth
	// for time; the client only interpolates from snapshots for smooth display.
	private clocksMs: ClockMs = { white: 0, black: 0 };
	private turnStartedAt: number | null = null;
	private flagTimer: ReturnType<typeof setTimeout> | null = null;
	// The last finished game's result. Non-null gates rematch (audit F5) and lets
	// a reconnecting player see how the game ended (audit SM-1.3).
	private result: GameResult | null = null;

	constructor({ time = 0, disconnectGraceMs, now }: GameRoomOptions) {
		this.timeControl = this.convertTimeOption(time);
		this.disconnectGraceMs = disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
		this.now = now ?? Date.now;
		this.createdAt = this.now();
		this.lastActivityAt = this.createdAt;
	}

	addPlayer(color: Color, ws: WebSocket): string {
		if (this.players.length >= 2) {
			throw new Error('Game room is full');
		}
		// Validate the requested color is a real seat before anything is stored.
		if (color !== 'white' && color !== 'black') {
			throw new Error('Invalid color');
		}
		// Enforce distinct seats server-side (audit F2).
		if (this.players.some((p) => p.color === color)) {
			throw new Error('Color already taken');
		}
		const playerId = nanoid();
		const player: Player = { id: playerId, color, ws, connected: true, disconnectedAt: null };
		this.players.push(player);
		this.touch();

		this.notifyPlayersOfJoin(playerId);

		if (this.players.length === 2) {
			this.startGame();
		}

		return playerId;
	}

	/**
	 * Mark a player's socket as gone. `ws` identifies WHICH socket closed: a late
	 * `close` from a socket that has already been replaced by a reconnect must not
	 * null out the new one (audit SM-1.1), so it is ignored unless it is still the
	 * player's current socket.
	 */
	removePlayer(playerId: string, ws?: WebSocket) {
		const player = this.findPlayerById(playerId);
		if (!player) return;
		if (ws && player.ws !== ws) return;
		if (!player.connected) return;

		player.connected = false;
		player.ws = null;
		player.disconnectedAt = this.now();
		this.touch();

		// Stop the watchdog if nobody is left to receive a flag-fall broadcast,
		// so an abandoned room doesn't leak a pending timer.
		if (this.players.every((p) => !p.connected)) {
			this.clearFlagTimer();
		}

		const opponent = this.opponentOf(player);
		if (opponent) {
			this.sendToPlayer(opponent, {
				type: 'opponentDisconnected',
				graceMs: this.disconnectGraceMs
			});
		}
	}

	/** True if at least one seated player still has a live connection. */
	hasConnectedPlayers(): boolean {
		return this.players.some((p) => p.connected);
	}

	reconnectPlayer(playerId: string, ws: WebSocket): boolean {
		const player = this.findPlayerById(playerId);
		if (!player) {
			return false;
		}

		// A previous socket for this seat may still be open (a half-dead network
		// path, or the same seat in another tab). Close it so only one live socket
		// per seat ever exists; its late `close` is ignored by removePlayer.
		const previous = player.ws;
		player.ws = ws;
		player.connected = true;
		player.disconnectedAt = null;
		this.touch();
		if (previous && previous !== ws) {
			try {
				previous.close(CLOSE_REPLACED, 'Replaced by a newer connection');
			} catch {
				// best effort
			}
		}

		// The flag timer is cleared when everyone disconnects; re-arm it.
		if (this.gameStarted && !this.flagTimer) {
			this.scheduleFlagTimer();
		}

		this.resyncPlayer(player);
		const opponent = this.opponentOf(player);
		if (opponent) {
			this.sendToPlayer(opponent, { type: 'opponentReconnected' });
		}

		return true;
	}

	handleMessage(playerId: string, message: GameMessage) {
		const player = this.findPlayerById(playerId);
		if (!player) return;
		this.touch();

		switch (message.type) {
			case 'move':
				this.handleMove(player, message.move);
				break;
			case 'offerRematch':
			case 'acceptRematch':
				if (this.canRematch()) {
					this.handleRematchOffer(player);
				}
				break;
			case 'resign':
				this.handleResign(player);
				break;
			case 'claimVictory':
				this.handleClaimVictory(player);
				break;
			// NOTE: there is deliberately no 'gameOver'/'timeout' case — clients
			// cannot declare outcomes (audit F1). Timeouts are decided by the
			// server's flag-fall watchdog (onFlagFall).
		}
	}

	private handleMove(player: Player, move: { from: string; to: string; promotion?: string }) {
		if (!this.gameStarted || player.color !== this.currentTurn) {
			this.resyncPlayer(player);
			return;
		}

		// The mover's flag may already have fallen before the watchdog fired (timer
		// latency, event-loop stalls). A move that arrives after the deadline must
		// lose on time, not be accepted with a clamped clock (audit SM-1.4).
		if (
			!this.timeControl.isUnlimited &&
			remainingMs(
				this.clocksMs,
				this.currentTurn,
				this.turnStartedAt,
				this.currentTurn,
				this.now()
			) <= 0
		) {
			this.onFlagFall();
			return;
		}

		if (!move || typeof move.from !== 'string' || typeof move.to !== 'string') {
			this.resyncPlayer(player);
			return;
		}

		let success;
		try {
			// chess.js (beta) throws on illegal moves
			success = this.chess.move(move);
		} catch {
			this.resyncPlayer(player);
			return;
		}

		if (!success) {
			this.resyncPlayer(player);
			return;
		}

		this.updateGameStateAfterMove(player, {
			from: success.from,
			to: success.to,
			promotion: success.promotion
		});
	}

	private handleResign(player: Player) {
		if (!this.gameStarted) return;
		this.finishGame(opposite(player.color), 'resignation');
	}

	/**
	 * The connected side may claim the win once its opponent has been gone for
	 * longer than the grace period. Verified entirely server-side (audit SM-1.6).
	 */
	private handleClaimVictory(player: Player) {
		if (!this.gameStarted) return;
		const opponent = this.opponentOf(player);
		if (!opponent || opponent.connected || opponent.disconnectedAt === null) {
			this.resyncPlayer(player);
			return;
		}
		if (this.now() - opponent.disconnectedAt < this.disconnectGraceMs) {
			this.resyncPlayer(player);
			return;
		}
		this.finishGame(player.color, 'abandonment');
	}

	private canRematch(): boolean {
		return this.result !== null && !this.gameStarted && this.players.length === 2;
	}

	private resyncPlayer(player: Player) {
		this.sendToPlayer(player, this.stateMessageFor(player));
	}

	private updateGameStateAfterMove(
		player: Player,
		move: { from: string; to: string; promotion?: string }
	) {
		const now = this.now();

		// Apply the clock to the mover (the side whose turn just ended), then flip.
		if (!this.timeControl.isUnlimited) {
			this.clocksMs[player.color] = clockAfterMove(
				this.clocksMs[player.color],
				this.turnStartedAt,
				this.timeControl.increment * 1000,
				now
			);
		}

		this.currentTurn = opposite(player.color);
		this.turnStartedAt = this.timeControl.isUnlimited ? null : now;

		this.broadcastMove(player.id, move);
		this.broadcastClock();

		const outcome = gameOutcome(this.chess);
		if (outcome) {
			this.finishGame(outcome.winner ?? 'draw', outcome.reason);
		} else {
			this.scheduleFlagTimer();
		}
	}

	private scheduleFlagTimer() {
		this.clearFlagTimer();
		if (this.timeControl.isUnlimited || !this.gameStarted) return;

		const remaining = remainingMs(
			this.clocksMs,
			this.currentTurn,
			this.turnStartedAt,
			this.currentTurn,
			this.now()
		);
		this.flagTimer = setTimeout(() => this.onFlagFall(), Math.max(0, remaining));
	}

	private clearFlagTimer() {
		if (this.flagTimer) {
			clearTimeout(this.flagTimer);
			this.flagTimer = null;
		}
	}

	/** Exposed for tests: run the flag-fall check now. */
	onFlagFall() {
		this.flagTimer = null;
		if (!this.gameStarted || this.timeControl.isUnlimited) return;

		const remaining = remainingMs(
			this.clocksMs,
			this.currentTurn,
			this.turnStartedAt,
			this.currentTurn,
			this.now()
		);
		if (remaining > 0) {
			// Re-arm if the authoritative clock still has time remaining.
			this.scheduleFlagTimer();
			return;
		}

		// The side on the move has run out. Snap their clock to 0.
		this.clocksMs[this.currentTurn] = 0;
		this.turnStartedAt = null;
		const winner = opposite(this.currentTurn);
		// Losing on time to a side that cannot possibly mate is a draw (FIDE 6.9).
		if (!hasMatingMaterial(this.chess, winner)) {
			this.finishGame('draw', 'timeoutVsInsufficient');
		} else {
			this.finishGame(winner, 'timeout');
		}
	}

	private finishGame(winner: Color | 'draw', reason: GameOverReason) {
		this.gameStarted = false;
		this.result = { winner, reason };
		this.rematchOffers.clear();
		this.clearFlagTimer();
		this.turnStartedAt = null;
		this.broadcastToAllPlayers({
			type: 'gameOver',
			winner,
			reason,
			clock: this.currentSnapshot()
		});
	}

	private handleRematchOffer(player: Player) {
		const isNew = !this.rematchOffers.has(player.color);
		this.rematchOffers.add(player.color);
		if (this.rematchOffers.size === 2) {
			this.restartGame();
			return;
		}
		if (isNew) {
			const opponent = this.opponentOf(player);
			if (opponent) this.sendToPlayer(opponent, { type: 'rematchOffer' });
		}
	}

	private restartGame() {
		this.chess.reset();
		this.currentTurn = 'white';
		this.rematchOffers.clear();
		this.result = null;
		this.gameStarted = true;
		this.initClocks();
		this.scheduleFlagTimer();

		this.players.forEach((player) => {
			this.sendToPlayer(player, {
				type: 'rematchAccepted',
				timeControl: this.timeControl,
				fen: this.chess.fen(),
				turn: this.currentTurn,
				clock: this.currentSnapshot()
			});
		});
	}

	private broadcastMove(senderId: string, move: { from: string; to: string; promotion?: string }) {
		// Normalised from chess.js's result — never the raw client frame.
		const normalized: { from: string; to: string; promotion?: string } = {
			from: move.from,
			to: move.to
		};
		if (move.promotion) normalized.promotion = move.promotion;
		this.broadcastToOtherPlayers(senderId, { type: 'opponentMove', move: normalized });
	}

	private broadcastClock() {
		if (this.timeControl.isUnlimited) return;
		this.broadcastToAllPlayers({ type: 'clock', clock: this.currentSnapshot() });
	}

	private broadcastToAllPlayers(message: object) {
		this.players.forEach((player) => this.sendToPlayer(player, message));
	}

	private broadcastToOtherPlayers(senderId: string, message: object) {
		this.players.forEach((player) => {
			if (player.id !== senderId) {
				this.sendToPlayer(player, message);
			}
		});
	}

	private sendToPlayer(player: Player, message: object) {
		if (player.connected && player.ws) {
			try {
				player.ws.send(JSON.stringify(message));
			} catch (error) {
				console.error('Failed to send to player:', error);
			}
		}
	}

	private convertTimeOption(time: TimeOption): TimeControl {
		const timeControls: Record<TimeOption, TimeControl> = {
			0: { initial: 0, lowTimeThreshold: 0, increment: 0, isUnlimited: true },
			1: { initial: 60, lowTimeThreshold: 10, increment: 3, isUnlimited: false },
			3: { initial: 180, lowTimeThreshold: 30, increment: 4, isUnlimited: false },
			10: { initial: 600, lowTimeThreshold: 60, increment: 5, isUnlimited: false }
		};

		const timeControl = timeControls[time];
		if (!timeControl) {
			throw new Error('Invalid time option');
		}
		return timeControl;
	}

	private notifyPlayersOfJoin(newPlayerId: string) {
		this.players.forEach((player) => {
			if (this.players.length === 2) {
				this.sendToPlayer(player, { type: 'opponentJoined' });
			} else if (player.id !== newPlayerId) {
				this.sendToPlayer(player, { type: 'opponentJoined' });
			}
		});
	}

	private startGame() {
		this.gameStarted = true;
		this.result = null;
		this.initClocks();
		this.players.forEach((player) => {
			this.sendToPlayer(player, {
				type: 'gameStart',
				timeControl: this.timeControl,
				fen: this.chess.fen(),
				turn: this.currentTurn,
				clock: this.currentSnapshot()
			});
		});
		this.scheduleFlagTimer();
	}

	/** Reset both clocks to the initial control and start white's clock now. */
	private initClocks() {
		const initialMs = this.timeControl.isUnlimited ? 0 : this.timeControl.initial * 1000;
		this.clocksMs = { white: initialMs, black: initialMs };
		this.turnStartedAt = this.timeControl.isUnlimited ? null : this.now();
	}

	private currentSnapshot(): ClockSnapshot {
		const running = this.timeControl.isUnlimited || !this.gameStarted ? null : this.currentTurn;
		return buildSnapshot(this.clocksMs, running, this.turnStartedAt, this.now());
	}

	private findPlayerById(playerId: string): Player | undefined {
		return this.players.find((p) => p.id === playerId);
	}

	private opponentOf(player: Player): Player | undefined {
		return this.players.find((p) => p.id !== player.id);
	}

	private touch() {
		this.lastActivityAt = this.now();
	}

	/** Moves played so far in UCI long algebraic notation (e.g. "e2e4", "e7e8q"). */
	private moveList(): string[] {
		return this.chess.history({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ''}`);
	}

	/**
	 * The full, per-player resync payload. Carries everything a (re)connecting
	 * client needs to rebuild its view: position + move list (so the SAN list and
	 * PGN survive a resync, audit SM-1.5), clocks, the last result and rematch
	 * state (audit SM-1.3), and opponent presence (audit SM-1.6).
	 */
	stateMessageFor(player: Player) {
		const opponent = this.opponentOf(player);
		const opponentGone = opponent && !opponent.connected && opponent.disconnectedAt !== null;
		return {
			type: 'gameState' as const,
			started: this.gameStarted,
			fen: this.chess.fen(),
			turn: this.currentTurn,
			moves: this.moveList(),
			clock: this.currentSnapshot(),
			timeControl: this.timeControl,
			gameOver: this.result,
			rematch: {
				mine: this.rematchOffers.has(player.color),
				opponent: this.rematchOffers.has(opposite(player.color))
			},
			opponentConnected: !!opponent && opponent.connected,
			// Ms left until the win may be claimed (0 = claimable now), if the opponent is away.
			opponentGraceMs: opponentGone
				? Math.max(0, this.disconnectGraceMs - (this.now() - opponent.disconnectedAt!))
				: null
		};
	}
}
