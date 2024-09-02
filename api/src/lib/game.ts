import WebSocket from 'ws';
import { GameRoom } from './GameRoom';

const games = new Map<string, GameRoom>();

export function createGame(): string {
	const game = new GameRoom();
	games.set(game.id, game);
	return game.id;
}

export function addPlayerToGame(
	gameId: string,
	color: 'white' | 'black',
	ws: WebSocket
): string | null {
	const game = games.get(gameId);
	if (!game) return null;

	try {
		return game.addPlayer(color, ws);
	} catch (error) {
		console.error('Error adding player to game:', error);
		return null;
	}
}

export function removePlayerFromGame(gameId: string, playerId: string) {
	const game = games.get(gameId);
	if (game) {
		game.removePlayer(playerId);
		if (game.players.length === 0) {
			games.delete(gameId);
		}
	}
}

export function handlePlayerMessage(gameId: string, playerId: string, message: string) {
	const game = games.get(gameId);
	if (game) {
		game.handleMessage(playerId, JSON.parse(message));
	}
}

export function checkGameStart(gameId: string): boolean {
	const game = games.get(gameId);
	if (game) {
		game.checkGameStart();
		return true;
	}
	return false;
}
