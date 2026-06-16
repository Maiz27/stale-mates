import { describe, it, expect } from 'vitest';
import { remainingMs, clockAfterMove, buildSnapshot, ClockMs } from './clock';

describe('remainingMs', () => {
	const clocks: ClockMs = { white: 60_000, black: 45_000 };

	it('deducts live elapsed time from the running side', () => {
		// white is running, its turn started at t=1000, now t=4000 -> 3s elapsed
		expect(remainingMs(clocks, 'white', 1000, 'white', 4000)).toBe(57_000);
	});

	it('does not deduct from the non-running side', () => {
		expect(remainingMs(clocks, 'white', 1000, 'black', 4000)).toBe(45_000);
	});

	it('treats a null running side as paused (no deduction)', () => {
		expect(remainingMs(clocks, null, null, 'white', 9999)).toBe(60_000);
	});

	it('the non-running side is flat as `now` advances', () => {
		const a = remainingMs(clocks, 'white', 1000, 'black', 2000);
		const b = remainingMs(clocks, 'white', 1000, 'black', 50_000);
		expect(a).toBe(b);
	});

	it('the running side decreases as `now` advances', () => {
		const a = remainingMs(clocks, 'white', 1000, 'white', 2000);
		const b = remainingMs(clocks, 'white', 1000, 'white', 5000);
		expect(b).toBeLessThan(a);
	});
});

describe('clockAfterMove', () => {
	it('deducts the time spent on the move, then adds the increment', () => {
		// started at 1000, moved at 3500 -> 2500ms spent; +3000ms increment
		expect(clockAfterMove(60_000, 1000, 3000, 3500)).toBe(60_000 - 2500 + 3000);
	});

	it('awards the increment but deducts no elapsed time when no turn was in progress', () => {
		expect(clockAfterMove(60_000, null, 3000, 3500)).toBe(63_000);
	});

	it('returns 0 (no increment) if the player had already flagged', () => {
		// 1000ms left, spent 2000ms -> flagged; increment is not awarded
		expect(clockAfterMove(1000, 0, 3000, 2000)).toBe(0);
	});

	it('unlimited-style zero increment just deducts elapsed', () => {
		expect(clockAfterMove(60_000, 1000, 0, 6000)).toBe(55_000);
	});
});

describe('buildSnapshot', () => {
	it('clamps displayed remaining time at zero', () => {
		const clocks: ClockMs = { white: 500, black: 30_000 };
		// white running, 2s elapsed -> would be negative, clamped to 0
		const snap = buildSnapshot(clocks, 'white', 0, 2000);
		expect(snap.whiteMs).toBe(0);
		expect(snap.blackMs).toBe(30_000);
		expect(snap.running).toBe('white');
		expect(snap.serverTime).toBe(2000);
	});

	it('carries the running side and server time', () => {
		const clocks: ClockMs = { white: 10_000, black: 10_000 };
		const snap = buildSnapshot(clocks, null, null, 1234);
		expect(snap.running).toBeNull();
		expect(snap.serverTime).toBe(1234);
		expect(snap.whiteMs).toBe(10_000);
	});
});
