import WebSocket from 'ws';
import { GameRoom } from './GameRoom';
import { TimeOption } from './types';

const gameRooms = new Map<string, GameRoom>();

export function createGame({ time }: { time: TimeOption }): string {
	const room = new GameRoom({ time });
	gameRooms.set(room.id, room);
	return room.id;
}

export function addPlayerToGame(
	gameId: string,
	color: 'white' | 'black',
	ws: WebSocket
): string | null {
	const room = gameRooms.get(gameId);
	if (!room) return null;

	try {
		return room.addPlayer(color, ws);
	} catch (error) {
		console.error('Error adding player to game:', error);
		return null;
	}
}

export function removePlayerFromGame(gameId: string, playerId: string) {
	const room = gameRooms.get(gameId);
	if (room) {
		room.removePlayer(playerId);
		if (room.players.length === 0) {
			gameRooms.delete(gameId);
		}
	}
}

export function handlePlayerMessage(gameId: string, playerId: string, message: string) {
	const room = gameRooms.get(gameId);
	if (room) {
		room.handleMessage(playerId, JSON.parse(message));
	}
}

export function checkGameStart(gameId: string): boolean {
	const room = gameRooms.get(gameId);
	if (room && room.checkGameStart()) {
		return true;
	}
	return false;
}
