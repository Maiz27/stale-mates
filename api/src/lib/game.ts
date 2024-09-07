import WebSocket from 'ws';
import { GameRoom } from './GameRoom';
import { TimeOption } from './types';

const gameRooms = new Map<string, GameRoom>();

export function createGame({ time }: { time: TimeOption }): string {
	const room = new GameRoom({ time });
	gameRooms.set(room.id, room);
	return room.id;
}

export function getGameRoom(gameId: string): GameRoom | undefined {
	return gameRooms.get(gameId);
}

export function addPlayerToGame(
	gameId: string,
	color: 'white' | 'black',
	ws: WebSocket
): string | null {
	const room = getGameRoom(gameId);
	if (!room) return null;

	try {
		return room.addPlayer(color, ws);
	} catch (error) {
		console.error('Error adding player to game:', error);
		return null;
	}
}

export function removePlayerFromGame(gameId: string, playerId: string) {
	const room = getGameRoom(gameId);
	if (room) {
		room.removePlayer(playerId);
		if (room.players.every((p) => !p.connected)) {
			gameRooms.delete(gameId);
		}
	}
}

export function reconnectPlayerToGame(gameId: string, playerId: string, ws: WebSocket): boolean {
	const room = getGameRoom(gameId);
	if (room) {
		return room.reconnectPlayer(playerId, ws);
	}
	return false;
}

export function handlePlayerMessage(gameId: string, playerId: string, message: string) {
	const room = getGameRoom(gameId);
	if (room) {
		room.handleMessage(playerId, JSON.parse(message));
	}
}

export function checkGameStart(gameId: string): boolean {
	const room = getGameRoom(gameId);
	return room ? room.gameStarted : false;
}
