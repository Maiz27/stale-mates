/* eslint-disable @typescript-eslint/no-explicit-any */
import WebSocket from 'ws';
import { Chess } from 'chess.js';
import { nanoid } from 'nanoid';
import { Player, TimeControl, TimeOption, Color, GameMessage } from './types';

export class GameRoom {
	id: string = nanoid();
	players: Player[] = [];
	gameStarted: boolean = false;
	private chess: Chess = new Chess();
	private currentFen: string = this.chess.fen();
	private currentTurn: Color = 'white';
	private rematchOffers: Set<string> = new Set();
	private timeControl: TimeControl;
	private lastMoveTime?: number;

	constructor({ time = 0 }: { time: TimeOption }) {
		this.timeControl = this.convertTimeOption(time);
	}

	addPlayer(color: Color, ws: WebSocket): string {
		if (this.players.length >= 2) {
			throw new Error('Game room is full');
		}
		const playerId = nanoid();
		const timeRemaining = this.timeControl.isUnlimited ? null : this.timeControl.initial;
		const player = { id: playerId, color, ws, timeRemaining, connected: true };
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
		this.broadcastGameState();
	}

	reconnectPlayer(playerId: string, ws: WebSocket): boolean {
		const player = this.findPlayerById(playerId);
		if (!player) {
			return false;
		}

		player.ws = ws;
		player.connected = true;

		this.sendToPlayer(player, { type: 'gameState', ...this.getCurrentGameState() });
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
				this.handleRematchOffer(playerId);
				break;
			case 'acceptRematch':
				this.handleRematchAccept(playerId);
				break;
			case 'gameOver':
				if (message.reason === 'timeout') {
					this.handleTimeOut(message.winner);
				}
				break;
		}
	}

	private handleMove(player: Player, move: { from: string; to: string; promotion?: string }) {
		if (player.color !== this.currentTurn) return;

		const success = this.chess.move(move);
		if (success) {
			this.updateGameStateAfterMove(player.id, move);
		}
	}

	private updateGameStateAfterMove(
		playerId: string,
		move: { from: string; to: string; promotion?: string }
	) {
		this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';
		this.currentFen = this.chess.fen();
		this.broadcastMove(playerId, move);
		if (!this.timeControl.isUnlimited) {
			this.updatePlayerTime(this.findPlayerById(playerId)!);
		}
		this.checkGameEnd();
	}

	private updatePlayerTime(player: Player) {
		if (player.timeRemaining === null) return;

		const now = Date.now();
		if (this.lastMoveTime) {
			const timeTaken = (now - this.lastMoveTime) / 1000;
			player.timeRemaining -= timeTaken;

			if (player.timeRemaining <= this.timeControl.lowTimeThreshold) {
				player.timeRemaining += this.timeControl.increment;
			}

			if (player.timeRemaining <= 0) {
				this.handleTimeOut(player.color === 'white' ? 'black' : 'white');
			}
		}
		this.lastMoveTime = now;
		this.broadcastGameState();
	}

	private handleTimeOut(winner: Color) {
		this.broadcastGameOver(winner, 'timeout');
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
		if (this.rematchOffers.size === 2) {
			this.restartGame();

			this.players.forEach((player) => {
				this.sendToPlayer(player, { type: 'rematchAccepted' });
			});
		}
	}

	private restartGame() {
		this.chess.reset();
		this.currentTurn = 'white';
		this.currentFen = this.chess.fen();
		this.rematchOffers.clear();
		this.resetPlayerTimes();
		this.lastMoveTime = undefined;
	}

	private checkGameEnd() {
		if (this.chess.isGameOver()) {
			this.gameStarted = false;
			const { winner, reason } = this.determineGameOutcome();
			this.broadcastGameOver(winner, reason);
		}
	}

	private determineGameOutcome(): { winner?: Color; reason: string } {
		if (this.chess.isCheckmate()) {
			return { winner: this.currentTurn === 'white' ? 'black' : 'white', reason: 'checkmate' };
		}

		return { reason: 'draw' };
	}

	private broadcastMove(senderId: string, move: { from: string; to: string; promotion?: string }) {
		const moveMessage = { type: 'opponentMove', move: move };
		this.broadcastToOtherPlayers(senderId, moveMessage);
	}

	private broadcastGameOver(winner?: Color, reason?: string) {
		const gameOverMessage = { type: 'gameOver', winner, reason };
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
		this.players.forEach((player) => {
			this.sendToPlayer(player, {
				type: 'gameStart',
				timeControl: this.timeControl,
				fen: this.chess.fen(),
				turn: this.currentTurn
			});
		});
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

	private resetPlayerTimes() {
		this.players.forEach((player) => {
			if (player.timeRemaining !== null) {
				player.timeRemaining = this.timeControl.initial;
			}
		});
	}

	private broadcastGameState() {
		const stateMessage = {
			type: 'gameState',
			...this.getCurrentGameState()
		};
		this.broadcastToAllPlayers(stateMessage);
	}

	private getCurrentGameState() {
		return {
			started: this.gameStarted,
			fen: this.currentFen,
			turn: this.currentTurn,
			whiteTime: this.players.find((p) => p.color === 'white')?.timeRemaining,
			blackTime: this.players.find((p) => p.color === 'black')?.timeRemaining
		};
	}
}
