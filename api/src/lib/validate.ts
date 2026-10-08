import type { ClientMessage, WireMove } from './protocol';

/**
 * Runtime validation for every inbound WebSocket frame (audit SM-3 / plan §4.2).
 * Hand-written guards — no schema dependency. Anything that isn't exactly one of
 * the `ClientMessage` shapes is rejected (returns null), so handlers can trust
 * their input. Extra fields are stripped, never forwarded.
 */

const SQUARE = /^[a-h][1-8]$/;
const PROMOTION = new Set(['q', 'r', 'b', 'n']);
/** Seat tokens are nanoid()s; bound the length so junk can't be used as a map key probe. */
const TOKEN = /^[A-Za-z0-9_-]{10,64}$/;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseMove(value: unknown): WireMove | null {
	if (!isObject(value)) return null;
	const { from, to, promotion } = value;
	if (typeof from !== 'string' || !SQUARE.test(from)) return null;
	if (typeof to !== 'string' || !SQUARE.test(to)) return null;
	if (promotion === undefined || promotion === null) return { from, to };
	if (typeof promotion !== 'string' || !PROMOTION.has(promotion)) return null;
	return { from, to, promotion };
}

/** Parse + validate a raw frame. Returns a clean `ClientMessage` or null. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
	let data: unknown = raw;
	if (typeof raw === 'string' || raw instanceof Buffer) {
		try {
			data = JSON.parse(raw.toString());
		} catch {
			return null;
		}
	}
	if (!isObject(data) || typeof data.type !== 'string') return null;

	switch (data.type) {
		case 'join':
			return typeof data.token === 'string' && TOKEN.test(data.token)
				? { type: 'join', token: data.token }
				: null;
		case 'move': {
			const move = parseMove(data.move);
			return move ? { type: 'move', move } : null;
		}
		case 'offerRematch':
		case 'acceptRematch':
		case 'resign':
		case 'claimVictory':
			return { type: data.type };
		default:
			return null;
	}
}
