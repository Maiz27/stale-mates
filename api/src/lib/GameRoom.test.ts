import { describe, it, expect } from 'vitest';
import type WebSocket from 'ws';
import { GameRoom } from './GameRoom';
import type { TimeOption } from './types';

// Minimal fake socket — claimSeat/startGame call ws.send; we just need it to exist.
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

describe('GameRoom seats & tokens (audit F2 / C3)', () => {
	const sentTo = () => {
		const frames: Record<string, unknown>[] = [];
		const ws = {
			send: (d: string) => frames.push(JSON.parse(d)),
			close: () => {}
		} as unknown as WebSocket;
		return { ws, frames };
	};

	it('seats each token holder in its own colour and starts the game', () => {
		const room = new GameRoom({ time: 0 });
		const tokens = room.initialTokens();
		expect(room.claimSeat(tokens.black, fakeWs())?.color).toBe('black');
		expect(room.claimSeat(tokens.white, fakeWs())?.color).toBe('white');
		expect(room.players.map((p) => p.color).sort()).toEqual(['black', 'white']);
		expect(room.gameStarted).toBe(true);
	});

	it('rejects an unknown token', () => {
		const room = new GameRoom({ time: 0 });
		expect(room.claimSeat('not-a-real-token-xyz', fakeWs())).toBeNull();
		expect(room.players).toHaveLength(0);
	});

	it('makes the invite token single-use: after the first claim it is rotated', () => {
		const room = new GameRoom({ time: 0 });
		const invite = room.initialTokens().black;
		const { ws, frames } = sentTo();
		room.claimSeat(invite, ws);
		const seat = frames.find((f) => f.type === 'seat') as { color: string; token: string };
		expect(seat.color).toBe('black');
		expect(seat.token).not.toBe(invite);

		// A leaked invite link can no longer take the seat...
		expect(room.claimSeat(invite, fakeWs())).toBeNull();
		// ...but the rotated token reconnects the same player.
		const again = room.claimSeat(seat.token, fakeWs());
		expect(again?.color).toBe('black');
		expect(room.players).toHaveLength(1);
	});

	it('resolves a random creator colour server-side', () => {
		for (let i = 0; i < 10; i++) {
			const room = new GameRoom({ time: 0, creatorColor: 'random' });
			expect(['white', 'black']).toContain(room.creatorColor);
		}
	});

	it('rejects an invalid creator colour', () => {
		expect(() => new GameRoom({ time: 0, creatorColor: 'red' as 'white' })).toThrow(
			'Invalid color'
		);
	});
});
