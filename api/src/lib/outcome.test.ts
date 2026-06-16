import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { gameOutcome } from './outcome';

describe('gameOutcome', () => {
	it('returns null when the game is not over', () => {
		expect(gameOutcome(new Chess())).toBeNull();
	});

	it('reports checkmate with the correct winner (fool\'s mate -> black wins)', () => {
		const chess = new Chess();
		chess.move('f3');
		chess.move('e5');
		chess.move('g4');
		chess.move('Qh4#');
		expect(gameOutcome(chess)).toEqual({ winner: 'black', reason: 'checkmate' });
	});

	it('distinguishes stalemate from a generic draw (regression for the latent bug)', () => {
		// Classic stalemate: black to move, no legal moves, not in check.
		const chess = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
		expect(gameOutcome(chess)).toEqual({ reason: 'stalemate' });
	});

	it('reports insufficient material', () => {
		// Lone kings -> insufficient material draw.
		const chess = new Chess('7k/8/6K1/8/8/8/8/8 w - - 0 1');
		expect(gameOutcome(chess)).toEqual({ reason: 'insufficient' });
	});
});
