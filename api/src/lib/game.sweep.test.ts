import { describe, it, expect } from 'vitest';
import type WebSocket from 'ws';
import { GameRoom } from './GameRoom';
import {
	isRoomExpired,
	sweepAbandonedRooms,
	createGame,
	getGameRoom,
	getRoomCount,
	addPlayerToGame,
	removePlayerFromGame,
	reconnectPlayerToGame
} from './game';

const fakeWs = () => ({ send: () => {}, close: () => {} }) as unknown as WebSocket;

const TTL = 30 * 60 * 1000;

describe('isRoomExpired', () => {
	it('is false for a brand-new room (within TTL)', () => {
		const room = new GameRoom({ time: 0 });
		expect(isRoomExpired(room, room.createdAt + 1000, TTL)).toBe(false);
	});

	it('is true for an old room with no connected players', () => {
		const room = new GameRoom({ time: 0 });
		expect(isRoomExpired(room, room.createdAt + TTL, TTL)).toBe(true);
	});

	it('is false for an old room that still has a connected player', () => {
		const room = new GameRoom({ time: 0 });
		room.addPlayer('white', fakeWs());
		expect(isRoomExpired(room, room.createdAt + TTL * 2, TTL)).toBe(false);
	});

	it('becomes expired once the last player disconnects (and TTL has passed)', () => {
		const room = new GameRoom({ time: 0 });
		const id = room.addPlayer('white', fakeWs());
		room.removePlayer(id);
		expect(isRoomExpired(room, room.lastActivityAt + TTL, TTL)).toBe(true);
	});

	it('measures the grace period from the last activity, not creation (SM-1.2)', () => {
		let now = 0;
		const room = new GameRoom({ time: 0, now: () => now });
		const id = room.addPlayer('white', fakeWs());
		// The creator waits on the page for longer than the TTL, then refreshes.
		now = TTL * 2;
		room.removePlayer(id);
		// Immediately after the refresh's disconnect the room must survive.
		expect(isRoomExpired(room, now + 1000, TTL)).toBe(false);
		expect(isRoomExpired(room, now + TTL, TTL)).toBe(true);
	});
});

describe('removePlayerFromGame', () => {
	it('keeps the room when every player disconnects so they can reconnect (SM-1.2)', () => {
		const id = createGame({ time: 0 });
		const ws = fakeWs();
		const playerId = addPlayerToGame(id, 'white', ws)!;
		removePlayerFromGame(id, playerId, ws);
		expect(getGameRoom(id)).toBeDefined();
		expect(reconnectPlayerToGame(id, playerId, fakeWs())).toBe(true);
		// cleanup
		const room = getGameRoom(id)!;
		room.players.forEach((p) => room.removePlayer(p.id));
		sweepAbandonedRooms(room.lastActivityAt + TTL, TTL);
		expect(getGameRoom(id)).toBeUndefined();
	});
});

describe('sweepAbandonedRooms', () => {
	it('removes only abandoned rooms older than the TTL with no connections', () => {
		const before = getRoomCount();

		// A never-joined room: nobody ever connected.
		const abandonedId = createGame({ time: 0 });
		// A room with an active connection should survive the sweep.
		const activeId = createGame({ time: 0 });
		addPlayerToGame(activeId, 'white', fakeWs());

		const createdAt = getGameRoom(abandonedId)!.lastActivityAt;
		const swept = sweepAbandonedRooms(createdAt + TTL, TTL);

		expect(swept).toBeGreaterThanOrEqual(1);
		expect(getGameRoom(abandonedId)).toBeUndefined();
		expect(getGameRoom(activeId)).toBeDefined();

		// cleanup so we don't leak into other suites
		getGameRoom(activeId)?.players.forEach((p) => getGameRoom(activeId)!.removePlayer(p.id));
		sweepAbandonedRooms(createdAt + TTL, 0);
		expect(getRoomCount()).toBe(before);
	});

	it('does not sweep rooms within the TTL', () => {
		const id = createGame({ time: 0 });
		const createdAt = getGameRoom(id)!.createdAt;
		sweepAbandonedRooms(createdAt + 1000, TTL);
		expect(getGameRoom(id)).toBeDefined();
		// cleanup
		sweepAbandonedRooms(createdAt + TTL, 0);
	});
});
