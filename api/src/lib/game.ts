import WebSocket from 'ws';
import { GameRoom } from './GameRoom';
import { Color, TimeOption } from './types';
import type { CreateGameResponse } from './protocol';

const gameRooms = new Map<string, GameRoom>();

// Default room TTL: 30 minutes. Overridable via ROOM_TTL_MS (validated at startup).
export const DEFAULT_ROOM_TTL_MS = 30 * 60 * 1000;

function resolveRoomTtlMs(): number {
	const raw = process.env.ROOM_TTL_MS;
	if (!raw || raw.trim() === '') return DEFAULT_ROOM_TTL_MS;
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_ROOM_TTL_MS;
}

function resolveDisconnectGraceMs(): number | undefined {
	const raw = process.env.DISCONNECT_GRACE_MS;
	if (!raw || raw.trim() === '') return undefined;
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function resolveFirstMoveTimeoutMs(): number | undefined {
	const raw = process.env.FIRST_MOVE_TIMEOUT_MS;
	if (!raw || raw.trim() === '') return undefined;
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Pure predicate (audit H4): a room is "abandoned" — eligible for sweeping —
 * when nobody is connected AND nothing has happened in it (no join, leave or
 * message) for the TTL. Measuring from the last activity rather than creation
 * gives players who all dropped at once (e.g. the creator refreshing the
 * waiting page) the full TTL to come back (audit SM-1.2). Rooms are never
 * deleted on disconnect — only by this sweep. Side-effect free so it can be
 * unit-tested without timers.
 */
export function isRoomExpired(room: GameRoom, now: number, ttlMs: number): boolean {
	return !room.hasConnectedPlayers() && now - room.lastActivityAt >= ttlMs;
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

export function createGame({
	time,
	color = 'white'
}: {
	time: TimeOption;
	color?: Color | 'random';
}): CreateGameResponse {
	const room = new GameRoom({
		time,
		creatorColor: color,
		disconnectGraceMs: resolveDisconnectGraceMs(),
		firstMoveTimeoutMs: resolveFirstMoveTimeoutMs()
	});
	gameRooms.set(room.id, room);
	const tokens = room.initialTokens();
	const invite: Color = room.creatorColor === 'white' ? 'black' : 'white';
	return {
		id: room.id,
		you: { color: room.creatorColor, token: tokens[room.creatorColor] },
		invite: { color: invite, token: tokens[invite] }
	};
}

export function getGameRoom(gameId: string): GameRoom | undefined {
	return gameRooms.get(gameId);
}

/**
 * A player's socket closed. `ws` is the socket that closed, so a stale socket
 * that was already replaced by a reconnect can't unseat the new one. The room
 * itself is kept (players may reconnect) and is reaped by the TTL sweep.
 */
export function removePlayerFromGame(gameId: string, playerId: string, ws?: WebSocket) {
	getGameRoom(gameId)?.removePlayer(playerId, ws);
}

export function getRoomCount() {
	return gameRooms.size;
}
