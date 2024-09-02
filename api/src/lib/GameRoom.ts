import WebSocket from 'ws';
import { Chess } from 'chess.js';
import { nanoid } from 'nanoid';

type Player = {
	id: string;
	color: 'white' | 'black';
	ws: WebSocket;
	timeRemaining?: number;
};

export class GameRoom {
	id: string;
	players: Player[];
	chess: Chess;
	currentTurn: 'white' | 'black';
	gameTimer?: NodeJS.Timeout;
	rematchOffers: Set<string> = new Set();

	constructor() {
		this.id = nanoid();
		this.players = [];
		this.chess = new Chess();
		this.currentTurn = 'white';
	}

	addPlayer(color: 'white' | 'black', ws: WebSocket): string {
		if (this.players.length >= 2) {
			throw new Error('Game room is full');
		}
		const playerId = nanoid();
		this.players.push({ id: playerId, color, ws });
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
			// Add more message types as needed
		}
	}

	checkGameStart(): boolean {
		if (this.players.length !== 2) return false;

		this.chess = new Chess();
		this.broadcastGameState();

		this.players.forEach((player) => {
			player.ws.send(JSON.stringify({ type: 'opponentJoined' }));
			player.ws.send(JSON.stringify({ type: 'gameStart' }));
		});

		return true;
	}

	private handleMove(player: Player, move: any) {
		if (player.color !== this.currentTurn) return;

		const success = this.chess.move(move);
		if (success) {
			this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';
			this.broadcastMove(player.id, move);
			this.checkGameEnd();
		}
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
		// Reset timers if implemented
		this.broadcastGameState();
	}

	private checkGameEnd() {
		if (this.chess.isGameOver()) {
			// Handle game over logic
			this.broadcastGameOver();
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
			turn: this.currentTurn
		});

		this.players.forEach((player) => player.ws.send(stateMessage));
	}

	private broadcastGameOver() {
		const gameOverMessage = JSON.stringify({
			type: 'gameOver',
			result: this.chess.isCheckmate()
				? `${this.currentTurn === 'white' ? 'Black' : 'White'} wins`
				: 'Draw'
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
}
