/**
 * Lightweight in-memory, per-key fixed-window rate limiter (audit H4).
 *
 * Used to stop a single client from spamming `POST /game/create`. Keyed by IP.
 * State lives in a `Map`; like the rest of the server this is single-instance
 * only (see README "Limitations / scaling").
 *
 * The core decision is a pure function (`hitWindow`) so it can be unit-tested
 * without timers or sockets.
 */

export interface WindowState {
	/** Start time (ms) of the current fixed window. */
	windowStart: number;
	/** Number of hits recorded in the current window. */
	count: number;
}

export interface HitResult {
	allowed: boolean;
	/** The (possibly rolled-over) window state to persist for this key. */
	state: WindowState;
	/** Hits remaining in the current window after this one (>= 0). */
	remaining: number;
	/** When the current window resets (ms epoch). */
	resetAt: number;
}

/**
 * Pure fixed-window step. Given the previous window state for a key (or
 * undefined for a first-ever hit), decide whether this hit is allowed and
 * return the next state. Does not read the clock — `now` is injected.
 */
export function hitWindow(
	prev: WindowState | undefined,
	now: number,
	limit: number,
	windowMs: number
): HitResult {
	// Start a fresh window if there's no prior state or the previous window expired.
	if (!prev || now - prev.windowStart >= windowMs) {
		const state: WindowState = { windowStart: now, count: 1 };
		return {
			allowed: true,
			state,
			remaining: Math.max(0, limit - 1),
			resetAt: now + windowMs
		};
	}

	const resetAt = prev.windowStart + windowMs;
	if (prev.count >= limit) {
		// Over the limit — reject without incrementing further.
		return { allowed: false, state: prev, remaining: 0, resetAt };
	}

	const state: WindowState = { windowStart: prev.windowStart, count: prev.count + 1 };
	return { allowed: true, state, remaining: Math.max(0, limit - state.count), resetAt };
}

export interface RateLimiterOptions {
	/** Max allowed hits per window. */
	limit: number;
	/** Window length in ms. */
	windowMs: number;
}

/**
 * Stateful wrapper around `hitWindow`. Keeps a `Map` of per-key windows and
 * lazily evicts a key's state once its window has fully expired on the next hit.
 */
export class RateLimiter {
	private readonly windows = new Map<string, WindowState>();
	private readonly limit: number;
	private readonly windowMs: number;

	constructor({ limit, windowMs }: RateLimiterOptions) {
		this.limit = limit;
		this.windowMs = windowMs;
	}

	/** Record a hit for `key` at `now` (defaults to Date.now()). */
	hit(key: string, now: number = Date.now()): HitResult {
		const result = hitWindow(this.windows.get(key), now, this.limit, this.windowMs);
		this.windows.set(key, result.state);
		// Opportunistically evict fully-expired windows so one-shot keys that are
		// never hit again don't accumulate forever. The map is naturally tiny
		// (per-IP, low-volume create traffic), so this O(n) sweep is cheap.
		this.prune(now);
		return result;
	}

	/** Drop every key whose current window has fully expired at `now`. */
	private prune(now: number): void {
		for (const [key, state] of this.windows) {
			if (now - state.windowStart >= this.windowMs) {
				this.windows.delete(key);
			}
		}
	}

	/** Test/diagnostic helper: number of tracked keys. */
	size(): number {
		return this.windows.size;
	}
}
