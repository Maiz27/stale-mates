import { Color } from './types';

/**
 * Pure, authoritative clock math for the multiplayer server.
 *
 * No `Date.now()` or `setTimeout` lives in here — the current time is always
 * injected as `now` (ms). This keeps flag-fall deterministic and unit-testable
 * (see clock.test.ts). Clocks are stored in MILLISECONDS to avoid the
 * seconds/ms rounding drift the old per-move logic suffered from.
 */

export type ClockMs = { white: number; black: number };

/** A snapshot the client interpolates from for smooth display. */
export type ClockSnapshot = {
	whiteMs: number;
	blackMs: number;
	running: Color | null; // whose clock is ticking (null = paused / unlimited / over)
	serverTime: number; // Date.now() on the server when the snapshot was taken
};

/**
 * Remaining ms for `color`. If `color` is the running side, the time elapsed
 * since `turnStartedAt` is deducted live (computed-on-read, never mutated).
 */
export function remainingMs(
	clocks: ClockMs,
	running: Color | null,
	turnStartedAt: number | null,
	color: Color,
	now: number
): number {
	if (running === color && turnStartedAt !== null) {
		return clocks[color] - (now - turnStartedAt);
	}
	return clocks[color];
}

/**
 * The mover's new remaining ms after completing a move: deduct the time spent
 * on the move, then add the increment (awarded only if they did not flag).
 */
export function clockAfterMove(
	currentMs: number,
	turnStartedAt: number | null,
	incrementMs: number,
	now: number
): number {
	const elapsed = turnStartedAt !== null ? now - turnStartedAt : 0;
	const remaining = currentMs - elapsed;
	if (remaining <= 0) return 0;
	return remaining + incrementMs;
}

/** Build a wire snapshot, clamping displayed remaining time at zero. */
export function buildSnapshot(
	clocks: ClockMs,
	running: Color | null,
	turnStartedAt: number | null,
	now: number
): ClockSnapshot {
	return {
		whiteMs: Math.max(0, remainingMs(clocks, running, turnStartedAt, 'white', now)),
		blackMs: Math.max(0, remainingMs(clocks, running, turnStartedAt, 'black', now)),
		running,
		serverTime: now
	};
}
