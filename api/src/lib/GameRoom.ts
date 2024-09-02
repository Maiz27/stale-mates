/* eslint-disable @typescript-eslint/no-explicit-any */
import WebSocket from 'ws';
import { Chess } from 'chess.js';
import { nanoid } from 'nanoid';
import { Player, TimeControl, TimeOption } from './types';

export class GameRoom {
	id: string;
	players: Player[];
	chess: Chess;
	currentTurn: 'white' | 'black';
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

	addPlayer(color: 'white' | 'black', ws: WebSocket): string {
		if (this.players.length >= 2) {
			throw new Error('Game room is full');
		}
		const playerId = nanoid();
		const timeRemaining = this.timeControl.isUnlimited ? null : this.timeControl.initial;
		this.players.push({ id: playerId, color, ws, timeRemaining });
		return playerId;
	}

	removePlayer(playerId: string) {
		this.players = this.players.filter((p) => p.id !== playerId);
		this.broadcastGameState();
	}

	handleMessage(playerId: string, message: any) {
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
			player.ws.send(JSON.stringify({ type: 'opponentJoined' }));
			player.ws.send(JSON.stringify({ type: 'gameStart', timeControl: this.timeControl }));
		});

		return true;
	}

	private handleMove(player: Player, move: any) {
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

	private handleTimeOut(winner: 'white' | 'black') {
		this.broadcastGameOver(winner, 'timeout');
	}

	private handleRematchOffer(playerId: string) {
		this.rematchOffers.add(playerId);
		if (this.rematchOffers.size === 2) {
			this.restartGame();
		} else {
			this.broadcastRematchOffer(playerId);
		}
	}

	private handleRematchAccept(playerId: string) {
		this.rematchOffers.add(playerId);
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
		this.broadcastGameState();
	}

	private checkGameEnd() {
		if (this.chess.isGameOver()) {
			let winner: 'white' | 'black' | undefined;
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

	private broadcastMove(senderId: string, move: any) {
		const moveMessage = JSON.stringify({
			type: 'opponentMove',
			move: move
		});

		this.players.forEach((player) => {
			if (player.id !== senderId) {
				player.ws.send(moveMessage);
			}
		});
	}

	private broadcastGameState() {
		const stateMessage = JSON.stringify({
			type: 'gameState',
			fen: this.chess.fen(),
			turn: this.currentTurn,
			whiteTime: this.players.find((p) => p.color === 'white')?.timeRemaining,
			blackTime: this.players.find((p) => p.color === 'black')?.timeRemaining
		});

		this.players.forEach((player) => player.ws.send(stateMessage));
	}

	private broadcastGameOver(winner?: 'white' | 'black', reason?: string) {
		const gameOverMessage = JSON.stringify({
			type: 'gameOver',
			winner,
			reason
		});

		this.players.forEach((player) => player.ws.send(gameOverMessage));
	}

	private broadcastRematchOffer(offerId: string) {
		const rematchMessage = JSON.stringify({
			type: 'rematchOffer',
			offerId: offerId
		});

		this.players.forEach((player) => {
			if (player.id !== offerId) {
				player.ws.send(rematchMessage);
			}
		});
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
