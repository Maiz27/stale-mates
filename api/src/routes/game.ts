import express from 'express';
import { createGame } from '../lib/game';
import { TimeOption } from '../lib/types';

const ALLOWED_TIME_OPTIONS: TimeOption[] = [0, 1, 3, 10];

export const GameRouter = express.Router();

GameRouter.get('/', (req, res) => {
	res.json({ message: 'Hello from the game API!' });
});

GameRouter.post('/create', (req, res) => {
	const rawTime = req.body.time;
	const time = Number(rawTime);

	// Reject missing/blank/non-numeric values (Number('') === 0 would slip through otherwise)
	if (rawTime === undefined || rawTime === null || rawTime === '' || !Number.isInteger(time)) {
		return res.status(400).json({ error: 'Invalid time option' });
	}

	if (!ALLOWED_TIME_OPTIONS.includes(time as TimeOption)) {
		return res.status(400).json({ error: 'Invalid time option' });
	}

	try {
		const id = createGame({ time: time as TimeOption });
		res.json({ id });
	} catch (error) {
		console.error('Error creating game:', error);
		res.status(500).json({ error: 'Failed to create game' });
	}
});

GameRouter.post('/join', (req, res) => {
	const id = req.query.id as string;

	if (!id) {
		return res.status(400).json({ error: 'Room ID is required' });
	}

	res.json({ success: true });
});
