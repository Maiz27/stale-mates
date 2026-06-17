import WebSocket from 'ws';
import { GameRoom } from './GameRoom';
import { TimeOption } from './types';

const gameRooms = new Map<string, GameRoom>();

// Default room TTL: 30 minutes. Overridable via ROOM_TTL_MS (validated at startup).
export const DEFAULT_ROOM_TTL_MS = 30 * 60 * 1000;

function resolveRoomTtlMs(): number {
	const raw = process.env.ROOM_TTL_MS;
	if (!raw || raw.trim() === '') return DEFAULT_ROOM_TTL_MS;
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_ROOM_TTL_MS;
}

/**
 * Pure predicate (audit H4): a room is "abandoned" — eligible for sweeping —
 * when it is older than the TTL AND has no connected players. This covers both
 * never-joined rooms (created via POST but no WS ever connected) and
 * long-finished/empty rooms whose players have all disconnected. Side-effect
 * free so it can be unit-tested without timers.
 */
export function isRoomExpired(room: GameRoom, now: number, ttlMs: number): boolean {
	return now - room.createdAt >= ttlMs && !room.hasConnectedPlayers();
}

/**
 * Delete every abandoned room. Returns the number swept. Pure w.r.t. timers —
 * `now`/`ttlMs` are injected so it can be driven directly from a unit test.
 */
export function sweepAbandonedRooms(
	now: number = Date.now(),
	ttlMs: number = resolveRoomTtlMs()
): number {
	let swept = 0;
	for (const [id, room] of gameRooms) {
		if (isRoomExpired(room, now, ttlMs)) {
			gameRooms.delete(id);
			swept++;
		}
	}
	if (swept > 0) {
		console.log(`Swept ${swept} abandoned room(s); ${gameRooms.size} remaining`);
	}
	return swept;
}

/**
 * Start the periodic abandoned-room sweep. Call this once when the server boots
 * (from index.ts) — NOT at import time — so unit tests never spawn a timer. The
 * interval is `.unref()`ed so it can't keep the process alive on shutdown.
 */
export function startRoomSweep(intervalMs: number = 5 * 60 * 1000): ReturnType<typeof setInterval> {
	const ttlMs = resolveRoomTtlMs();
	const timer = setInterval(() => sweepAbandonedRooms(Date.now(), ttlMs), intervalMs);
	timer.unref();
	return timer;
}

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
	if (!room) return;

	let parsed;
	try {
		parsed = JSON.parse(message);
	} catch (error) {
		console.error('Error parsing player message, dropping frame:', error);
		return;
	}

	// JSON.parse can legitimately yield null/number/string; handleMessage reads
	// `message.type`, which would throw on a non-object. Drop those frames.
	if (typeof parsed !== 'object' || parsed === null) {
		console.error('Dropping non-object player message frame');
		return;
	}

	room.handleMessage(playerId, parsed);
}

export function getRoomCount() {
	return gameRooms.size;
}

export function checkGameStart(gameId: string): boolean {
	const room = getGameRoom(gameId);
	return room ? room.gameStarted : false;
}
