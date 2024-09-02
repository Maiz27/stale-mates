import express from 'express';
import { createGame } from '../lib/game';

export const GameRouter = express.Router();

GameRouter.get('/', (req, res) => {
	res.json({ message: 'Hello from the game API!' });
});

GameRouter.post('/create', (req, res) => {
	const { time } = req.body;

	try {
		const gameId = createGame({ time });
		res.json({ gameId });
	} catch (error) {
		console.error('Error creating game:', error);
		res.status(500).json({ error: 'Failed to create game' });
	}
});

GameRouter.post('/join', (req, res) => {
	const gameId = req.query.room as string;

	if (!gameId) {
		return res.status(400).json({ error: 'Game ID is required' });
	}

	res.json({ success: true });
});
