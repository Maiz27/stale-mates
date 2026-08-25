/* eslint-disable @typescript-eslint/no-explicit-any */
import WebSocket from 'ws';
import { Chess } from 'chess.js';
import { nanoid } from 'nanoid';
import { Player, TimeControl, TimeOption, Color, GameMessage, GameOverReason } from './types';
import { ClockMs, ClockSnapshot, buildSnapshot, clockAfterMove, remainingMs } from './clock';
import { gameOutcome } from './outcome';

export class GameRoom {
	id: string = nanoid();
	players: Player[] = [];
	gameStarted: boolean = false;
	// Wall-clock time (ms) the room was created. Used by the abandoned-room sweep
	// to bound memory: a room that nobody ever connects to is only cleaned up on a
	// WS `close`, so without this it would leak forever (audit H4).
	readonly createdAt: number = Date.now();
	private chess: Chess = new Chess();
	private currentFen: string = this.chess.fen();
	private currentTurn: Color = 'white';
	private rematchOffers: Set<string> = new Set();
	private timeControl: TimeControl;

	// Authoritative clock state (ms). The server is the single source of truth
	// for time; the client only interpolates from snapshots for smooth display.
	private clocksMs: ClockMs = { white: 0, black: 0 };
	private turnStartedAt: number | null = null;
	private flagTimer: ReturnType<typeof setTimeout> | null = null;
	// True once a game has actually ended (checkmate/draw/resign/timeout). Gates
	// rematch so it can't be triggered before any game has finished (audit F5).
	private gameEnded: boolean = false;

	constructor({ time = 0 }: { time: TimeOption }) {
		this.timeControl = this.convertTimeOption(time);
	}

	addPlayer(color: Color, ws: WebSocket): string {
		if (this.players.length >= 2) {
			throw new Error('Game room is full');
		}
		// Validate the requested color is a real seat (it arrives unchecked from the
		// WS URL) before anything is stored, so an invalid value can't break invariants.
		if (color !== 'white' && color !== 'black') {
			throw new Error('Invalid color');
		}
		// Enforce distinct seats server-side: the two players cannot hold the same
		// color (audit F2 — color was previously trusted from the URL unchecked,
		// so both clients could request white). The connection is rejected; a
		// legitimate opposite-color join is unaffected.
		if (this.players.some((p) => p.color === color)) {
			throw new Error('Color already taken');
		}
		const playerId = nanoid();
		const player: Player = { id: playerId, color, ws, connected: true };
		this.players.push(player);

		this.notifyPlayersOfJoin(playerId);

		if (this.players.length === 2) {
			this.startGame();
		}

		return playerId;
	}

	removePlayer(playerId: string) {
		const playerIndex = this.players.findIndex((p) => p.id === playerId);
		if (playerIndex !== -1) {
			this.players[playerIndex].connected = false;
			this.players[playerIndex].ws = null;
		}
		// Stop the watchdog if nobody is left to receive a flag-fall broadcast,
		// so an abandoned room doesn't leak a pending timer.
		if (this.players.every((p) => !p.connected)) {
			this.clearFlagTimer();
		}
		this.broadcastGameState();
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

		player.ws = ws;
		player.connected = true;

		this.resyncPlayer(player);
		this.notifyOpponentOfReconnection(playerId);

		return true;
	}

	handleMessage(playerId: string, message: GameMessage) {
		const player = this.findPlayerById(playerId);
		if (!player) return;

		switch (message.type) {
			case 'move':
				this.handleMove(player, message.move);
				break;
			case 'offerRematch':
				if (this.canRematch()) {
					this.handleRematchOffer(playerId);
				}
				break;
			case 'acceptRematch':
				if (this.canRematch()) {
					this.handleRematchAccept(playerId);
				}
				break;
			case 'resign':
				this.handleResign(player);
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

		if (!move || typeof move.from !== 'string' || typeof move.to !== 'string') {
			this.resyncPlayer(player);
			return;
		}

		let success;
		try {
			// chess.js (beta) throws on illegal moves
			success = this.chess.move(move);
		} catch (error) {
			console.error('Ignoring illegal move:', error);
			this.resyncPlayer(player);
			return;
		}

		if (!success) {
			this.resyncPlayer(player);
			return;
		}

		this.updateGameStateAfterMove(player, move);
	}

	private handleResign(player: Player) {
		if (!this.gameStarted) return;
		const opponentColor: Color = player.color === 'white' ? 'black' : 'white';
		this.finishGame(opponentColor, 'resignation');
	}

	private canRematch(): boolean {
		return this.gameEnded && this.players.length === 2;
	}

	private resyncPlayer(player: Player) {
		this.sendToPlayer(player, {
			type: 'gameState',
			...this.getCurrentGameState(),
			timeControl: this.timeControl
		});
	}

	private updateGameStateAfterMove(
		player: Player,
		move: { from: string; to: string; promotion?: string }
	) {
		const now = Date.now();

		// Apply the clock to the mover (the side whose turn just ended), then flip.
		if (!this.timeControl.isUnlimited) {
			this.clocksMs[player.color] = clockAfterMove(
				this.clocksMs[player.color],
				this.turnStartedAt,
				this.timeControl.increment * 1000,
				now
			);
		}

		this.currentTurn = player.color === 'white' ? 'black' : 'white';
		this.currentFen = this.chess.fen();
		this.turnStartedAt = this.timeControl.isUnlimited ? null : now;

		this.broadcastMove(player.id, move);
		this.broadcastClock();

		if (this.chess.isGameOver()) {
			const outcome = gameOutcome(this.chess);
			this.finishGame(outcome?.winner, outcome?.reason ?? 'draw');
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
			Date.now()
		);
		this.flagTimer = setTimeout(() => this.onFlagFall(), Math.max(0, remaining));
	}

	private clearFlagTimer() {
		if (this.flagTimer) {
			clearTimeout(this.flagTimer);
			this.flagTimer = null;
		}
	}

	private onFlagFall() {
		this.flagTimer = null;
		if (!this.gameStarted || this.timeControl.isUnlimited) return;

		const remaining = remainingMs(
			this.clocksMs,
			this.currentTurn,
			this.turnStartedAt,
			this.currentTurn,
			Date.now()
		);
		if (remaining > 0) {
			// Re-arm if the authoritative clock still has time remaining.
			this.scheduleFlagTimer();
			return;
		}

		// The side on the move has run out. Snap their clock to 0 and award the win.
		this.clocksMs[this.currentTurn] = 0;
		this.turnStartedAt = null;
		const winner: Color = this.currentTurn === 'white' ? 'black' : 'white';
		this.finishGame(winner, 'timeout');
	}

	private finishGame(winner: Color | undefined, reason: GameOverReason) {
		this.gameStarted = false;
		this.gameEnded = true;
		this.clearFlagTimer();
		this.turnStartedAt = null;
		this.broadcastGameOver(winner, reason);
	}

	private handleRematchOffer(playerId: string) {
		this.rematchOffers.add(playerId);
		this.broadcastRematchOffer(playerId);
		this.checkRematchAccepted();
	}

	private handleRematchAccept(playerId: string) {
		this.rematchOffers.add(playerId);
		this.checkRematchAccepted();
	}

	private checkRematchAccepted() {
		// Require both distinct seats to have accepted.
		if (this.rematchOffers.size === 2) {
			this.restartGame();

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
	}

	private restartGame() {
		this.chess.reset();
		this.currentTurn = 'white';
		this.currentFen = this.chess.fen();
		this.rematchOffers.clear();
		this.gameEnded = false;
		this.gameStarted = true;
		this.initClocks();
		this.scheduleFlagTimer();

		// Broadcast the new game state to all players
		this.broadcastGameState();
	}

	private broadcastMove(senderId: string, move: { from: string; to: string; promotion?: string }) {
		const moveMessage = { type: 'opponentMove', move: move };
		this.broadcastToOtherPlayers(senderId, moveMessage);
	}

	private broadcastClock() {
		if (this.timeControl.isUnlimited) return;
		this.broadcastToAllPlayers({ type: 'clock', clock: this.currentSnapshot() });
	}

	private broadcastGameOver(winner: Color | undefined, reason: GameOverReason) {
		const gameOverMessage = { type: 'gameOver', winner, reason, clock: this.currentSnapshot() };
		this.broadcastToAllPlayers(gameOverMessage);
	}

	private broadcastRematchOffer(offerId: string) {
		const rematchMessage = { type: 'rematchOffer', offerId: offerId };
		this.broadcastToOtherPlayers(offerId, rematchMessage);
	}

	private broadcastToAllPlayers(message: any) {
		this.players.forEach((player) => this.sendToPlayer(player, message));
	}

	private broadcastToOtherPlayers(senderId: string, message: any) {
		this.players.forEach((player) => {
			if (player.id !== senderId) {
				this.sendToPlayer(player, message);
			}
		});
	}

	private sendToPlayer(player: Player, message: any) {
		if (player.connected && player.ws) {
			player.ws.send(JSON.stringify(message));
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
		this.gameEnded = false;
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
		this.turnStartedAt = this.timeControl.isUnlimited ? null : Date.now();
	}

	private currentSnapshot(): ClockSnapshot {
		const running =
			this.timeControl.isUnlimited || !this.gameStarted ? null : this.currentTurn;
		return buildSnapshot(this.clocksMs, running, this.turnStartedAt, Date.now());
	}

	private notifyOpponentOfReconnection(reconnectedPlayerId: string) {
		const otherPlayer = this.players.find((p) => p.id !== reconnectedPlayerId);
		if (otherPlayer && otherPlayer.connected) {
			this.sendToPlayer(otherPlayer, { type: 'opponentReconnected' });
		}
	}

	private findPlayerById(playerId: string): Player | undefined {
		return this.players.find((p) => p.id === playerId);
	}

	private broadcastGameState() {
		const stateMessage = {
			type: 'gameState',
			...this.getCurrentGameState(),
			timeControl: this.timeControl
		};
		this.broadcastToAllPlayers(stateMessage);
	}

	private getCurrentGameState() {
		return {
			started: this.gameStarted,
			fen: this.currentFen,
			turn: this.currentTurn,
			clock: this.currentSnapshot()
		};
	}
}
