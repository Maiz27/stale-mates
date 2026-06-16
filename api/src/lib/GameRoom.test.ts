import { describe, it, expect } from 'vitest';
import type WebSocket from 'ws';
import { GameRoom } from './GameRoom';
import type { TimeOption } from './types';

// Minimal fake socket — addPlayer/startGame call ws.send; we just need it to exist.
const fakeWs = () => ({ send: () => {} }) as unknown as WebSocket;

/**
 * These tests exercise the pure, socket-free seam of GameRoom: its constructor,
 * which runs `convertTimeOption` to derive a TimeControl from a TimeOption.
 * No sockets, timers, or network are involved.
 *
 * Deeper GameRoom behaviour (moves, broadcasts, clocks) is intentionally NOT
 * tested here because it is coupled to WebSocket sends and wall-clock timers;
 * those await the clock-extraction refactor (later phase).
 */
describe('GameRoom constructor / convertTimeOption', () => {
	it('constructs for every valid time option without throwing', () => {
		const validOptions: TimeOption[] = [0, 1, 3, 10];
		for (const time of validOptions) {
			expect(() => new GameRoom({ time })).not.toThrow();
		}
	});

	it('defaults to the unlimited (0) time option when none is given', () => {
		// The constructor defaults `time` to 0; an unlimited room must construct cleanly.
		expect(() => new GameRoom({} as { time: TimeOption })).not.toThrow();
	});

	it('throws "Invalid time option" for an unsupported value', () => {
		expect(() => new GameRoom({ time: 5 as TimeOption })).toThrow('Invalid time option');
	});

	it('assigns a stable, non-empty room id on construction', () => {
		const room = new GameRoom({ time: 0 });
		expect(typeof room.id).toBe('string');
		expect(room.id.length).toBeGreaterThan(0);
	});

	it('starts with no players and gameStarted false', () => {
		const room = new GameRoom({ time: 1 });
		expect(room.players).toEqual([]);
		expect(room.gameStarted).toBe(false);
	});
});

describe('GameRoom seat assignment (audit F2)', () => {
	it('rejects a second player requesting an already-taken color', () => {
		const room = new GameRoom({ time: 0 });
		room.addPlayer('white', fakeWs());
		expect(() => room.addPlayer('white', fakeWs())).toThrow('Color already taken');
		expect(room.players).toHaveLength(1);
	});

	it('accepts two players with distinct colors and starts the game', () => {
		const room = new GameRoom({ time: 0 }); // unlimited -> no lingering flag timer
		room.addPlayer('white', fakeWs());
		room.addPlayer('black', fakeWs());
		expect(room.players.map((p) => p.color).sort()).toEqual(['black', 'white']);
		expect(room.gameStarted).toBe(true);
	});

	it('rejects a third player even with a new color', () => {
		const room = new GameRoom({ time: 0 });
		room.addPlayer('white', fakeWs());
		room.addPlayer('black', fakeWs());
		expect(() => room.addPlayer('white', fakeWs())).toThrow('Game room is full');
	});
});
