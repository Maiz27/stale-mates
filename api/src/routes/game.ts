import express from 'express';
import { createGame } from '../lib/game';

export const GameRouter = express.Router();

GameRouter.get('/', (req, res) => {
	res.json({ message: 'Hello from the game API!' });
});

GameRouter.post('/create', (req, res) => {
	const { time } = req.body;

	try {
		const id = createGame({ time });
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
