import express from 'express';
import { createGame } from '../lib/game';
import { Color, TimeOption } from '../lib/types';
import { RateLimiter } from '../lib/rateLimiter';

const ALLOWED_TIME_OPTIONS: TimeOption[] = [0, 1, 3, 10];
const ALLOWED_COLORS = ['white', 'black', 'random'] as const;

// Per-IP rate limit on room creation (audit H4): ~30 creates / 10 min / IP.
// In-memory and single-instance only — see README "Limitations / scaling".
const createLimiter = new RateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 });

export const GameRouter = express.Router();

GameRouter.get('/', (req, res) => {
	res.json({ message: 'Hello from the game API!' });
});

GameRouter.post('/create', (req, res) => {
	// Throttle per client IP before doing any work. `req.ip` honours the configured
	// trust-proxy setting; fall back to a constant bucket if it's somehow absent.
	const ip = req.ip || 'unknown';
	const limit = createLimiter.hit(ip);
	if (!limit.allowed) {
		const retryAfterSec = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
		res.setHeader('Retry-After', String(retryAfterSec));
		return res.status(429).json({ error: 'Too many game creations, please try again later' });
	}

	const body = (req.body ?? {}) as Record<string, unknown>;
	const rawTime = body.time;

	// Gate on type before coercion: Number(true) === 1 and Number([]) === 0, so a
	// boolean/array/object could otherwise be coerced into a "valid" time option.
	if (typeof rawTime !== 'string' && typeof rawTime !== 'number') {
		return res.status(400).json({ error: 'Invalid time option' });
	}

	const time = Number(rawTime);

	// Reject missing/blank/non-numeric values. Number('') and Number('   ') are
	// both 0, which would otherwise slip through as a valid "unlimited" game.
	if ((typeof rawTime === 'string' && rawTime.trim() === '') || !Number.isInteger(time)) {
		return res.status(400).json({ error: 'Invalid time option' });
	}

	if (!ALLOWED_TIME_OPTIONS.includes(time as TimeOption)) {
		return res.status(400).json({ error: 'Invalid time option' });
	}

	// The creator's seat. Optional (defaults to white); 'random' is resolved on the
	// server so the client can't bias it. The joiner always gets the other seat.
	const rawColor = body.color ?? 'white';
	if (typeof rawColor !== 'string' || !(ALLOWED_COLORS as readonly string[]).includes(rawColor)) {
		return res.status(400).json({ error: 'Invalid color' });
	}

	try {
		res.json(createGame({ time: time as TimeOption, color: rawColor as Color | 'random' }));
	} catch (error) {
		console.error('Error creating game:', error);
		res.status(500).json({ error: 'Failed to create game' });
	}
});
