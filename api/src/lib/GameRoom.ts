/* eslint-disable @typescript-eslint/no-explicit-any */
import WebSocket from 'ws';
import { Chess } from 'chess.js';
import { nanoid } from 'nanoid';
import { Player, TimeControl, TimeOption, Color } from './types';

type GameMessage =
	| { type: 'move'; playerId: string; move: { from: string; to: string; promotion?: string } }
	| { type: 'offerRematch'; playerId: string }
	| { type: 'acceptRematch'; playerId: string }
	| { type: 'gameOver'; reason: 'timeout'; winner: Color };

export class GameRoom {
	id: string;
	players: Player[];
	chess: Chess;
	currentTurn: Color;
	gameTimer?: NodeJS.Timeout;
	rematchOffers: Set<string> = new Set();
	timeControl: TimeControl;
	lastMoveTime?: number;

	constructor({ time = 0 }: { time: TimeOption }) {
		this.id = nanoid();
		this.players = [];
		this.chess = new Chess();
		this.currentTurn = 'white';
		this.timeControl = this.convertTimeOption(time);
	}

	addPlayer(color: Color, ws: WebSocket): string {
		if (this.players.length >= 2) {
			throw new Error('Game room is full');
		}
		const playerId = nanoid();
		const timeRemaining = this.timeControl.isUnlimited ? null : this.timeControl.initial;
		this.players.push({ id: playerId, color, ws, timeRemaining });

		// Notify the existing player (if any) that an opponent has joined
		if (this.players.length === 2) {
			this.players.forEach((player) => {
				this.sendToPlayer(player, { type: 'opponentJoined' });
			});
		}

		return playerId;
	}

	removePlayer(playerId: string) {
		this.players = this.players.filter((p) => p.id !== playerId);
		this.broadcastGameState();
	}

	handleMessage(playerId: string, message: GameMessage) {
		const player = this.players.find((p) => p.id === playerId);
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

	checkGameStart(): boolean {
		if (this.players.length !== 2) return false;

		this.chess = new Chess();
		this.broadcastGameState();

		this.players.forEach((player) => {
			this.sendToPlayer(player, { type: 'opponentJoined' });
			this.sendToPlayer(player, { type: 'gameStart', timeControl: this.timeControl });
		});

		return true;
	}

	private handleMove(player: Player, move: { from: string; to: string; promotion?: string }) {
		if (player.color !== this.currentTurn) return;

		const success = this.chess.move(move);
		if (success) {
			this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';
			this.broadcastMove(player.id, move);
			if (!this.timeControl.isUnlimited) {
				this.updatePlayerTime(player);
			}
			this.checkGameEnd();
		}
	}

	private updatePlayerTime(player: Player) {
		if (player.timeRemaining === null) return;

		const now = Date.now();
		if (this.lastMoveTime) {
			const timeTaken = (now - this.lastMoveTime) / 1000; // Convert to seconds
			player.timeRemaining -= timeTaken;

			// Apply increment only if player's time is below the low time threshold
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
		}
	}

	private restartGame() {
		this.chess.reset();
		this.currentTurn = 'white';
		this.rematchOffers.clear();
		this.players.forEach((player) => {
			if (player.timeRemaining !== null) {
				player.timeRemaining = this.timeControl.initial;
			}
		});
		this.lastMoveTime = undefined;

		this.players.forEach((player) => {
			this.sendToPlayer(player, {
				type: 'gameStart',
				timeControl: this.timeControl
			});
		});

		this.broadcastGameState();
	}

	private checkGameEnd() {
		if (this.chess.isGameOver()) {
			let winner: Color | undefined;
			let reason: string;
			if (this.chess.isCheckmate()) {
				winner = this.currentTurn === 'white' ? 'black' : 'white';
				reason = 'checkmate';
			} else {
				reason = 'draw';
			}
			this.broadcastGameOver(winner, reason);
		}
	}

	private broadcastMove(senderId: string, move: { from: string; to: string; promotion?: string }) {
		const moveMessage = {
			type: 'opponentMove',
			move: move
		};

		this.players.forEach((player) => {
			if (player.id !== senderId) {
				this.sendToPlayer(player, moveMessage);
			}
		});
	}

	private broadcastGameState() {
		const stateMessage = {
			type: 'gameState',
			fen: this.chess.fen(),
			turn: this.currentTurn,
			whiteTime: this.players.find((p) => p.color === 'white')?.timeRemaining,
			blackTime: this.players.find((p) => p.color === 'black')?.timeRemaining
		};

		this.players.forEach((player) => this.sendToPlayer(player, stateMessage));
	}

	private broadcastGameOver(winner?: Color, reason?: string) {
		const gameOverMessage = {
			type: 'gameOver',
			winner,
			reason
		};

		this.players.forEach((player) => this.sendToPlayer(player, gameOverMessage));
	}

	private broadcastRematchOffer(offerId: string) {
		const rematchMessage = {
			type: 'rematchOffer',
			offerId: offerId
		};

		this.players.forEach((player) => {
			if (player.id !== offerId) {
				this.sendToPlayer(player, rematchMessage);
			}
		});
	}

	private sendToPlayer(player: Player, message: any) {
		player.ws.send(JSON.stringify(message));
	}

	private convertTimeOption(time: TimeOption): TimeControl {
		switch (time) {
			case 0:
				return { initial: 0, lowTimeThreshold: 0, increment: 0, isUnlimited: true };
			case 1:
				return { initial: 60, lowTimeThreshold: 10, increment: 3, isUnlimited: false };
			case 3:
				return { initial: 180, lowTimeThreshold: 30, increment: 4, isUnlimited: false };
			case 10:
				return { initial: 600, lowTimeThreshold: 60, increment: 5, isUnlimited: false };
			default:
				throw new Error('Invalid time option');
		}
	}
}
