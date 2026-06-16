import { describe, it, expect } from 'vitest';
import { hitWindow, RateLimiter } from './rateLimiter';

describe('hitWindow', () => {
	const LIMIT = 3;
	const WINDOW = 1000;

	it('allows the first hit and opens a window', () => {
		const r = hitWindow(undefined, 0, LIMIT, WINDOW);
		expect(r.allowed).toBe(true);
		expect(r.state).toEqual({ windowStart: 0, count: 1 });
		expect(r.remaining).toBe(2);
		expect(r.resetAt).toBe(WINDOW);
	});

	it('allows hits up to the limit within a window', () => {
		let state = hitWindow(undefined, 0, LIMIT, WINDOW).state;
		const r2 = hitWindow(state, 100, LIMIT, WINDOW);
		expect(r2.allowed).toBe(true);
		state = r2.state;
		const r3 = hitWindow(state, 200, LIMIT, WINDOW);
		expect(r3.allowed).toBe(true);
		expect(r3.remaining).toBe(0);
	});

	it('rejects once the limit is exceeded within the window', () => {
		let state = hitWindow(undefined, 0, LIMIT, WINDOW).state;
		state = hitWindow(state, 100, LIMIT, WINDOW).state;
		state = hitWindow(state, 200, LIMIT, WINDOW).state;
		const over = hitWindow(state, 300, LIMIT, WINDOW);
		expect(over.allowed).toBe(false);
		expect(over.remaining).toBe(0);
		// count does not grow further while blocked
		expect(over.state.count).toBe(LIMIT);
	});

	it('resets into a fresh window after the window elapses', () => {
		let state = hitWindow(undefined, 0, LIMIT, WINDOW).state;
		state = hitWindow(state, 100, LIMIT, WINDOW).state;
		state = hitWindow(state, 200, LIMIT, WINDOW).state;
		// now blocked
		expect(hitWindow(state, 300, LIMIT, WINDOW).allowed).toBe(false);
		// window boundary reached -> fresh window, allowed again
		const fresh = hitWindow(state, 1000, LIMIT, WINDOW);
		expect(fresh.allowed).toBe(true);
		expect(fresh.state.windowStart).toBe(1000);
		expect(fresh.state.count).toBe(1);
	});
});

describe('RateLimiter', () => {
	it('tracks separate keys independently', () => {
		const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
		expect(rl.hit('a', 0).allowed).toBe(true);
		expect(rl.hit('a', 10).allowed).toBe(false); // a is over limit
		expect(rl.hit('b', 10).allowed).toBe(true); // b is fresh
		expect(rl.size()).toBe(2);
	});

	it('allows a key again after its window elapses', () => {
		const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
		expect(rl.hit('a', 0).allowed).toBe(true);
		expect(rl.hit('a', 500).allowed).toBe(false);
		expect(rl.hit('a', 1000).allowed).toBe(true);
	});
});
