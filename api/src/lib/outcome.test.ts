import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { gameOutcome, canStillCheckmate } from './outcome';

describe('gameOutcome', () => {
	it('returns null when the game is not over', () => {
		expect(gameOutcome(new Chess())).toBeNull();
	});

	it("reports checkmate with the correct winner (fool's mate -> black wins)", () => {
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

	it('reports the fifty-move rule (halfmove clock at 100), not a generic draw', () => {
		// Pawn on the board keeps it from being "insufficient material"; the
		// halfmove clock at 100 makes it a fifty-move-rule draw.
		const chess = new Chess('4k3/8/8/8/8/8/4P3/4K3 w - - 100 60');
		expect(gameOutcome(chess)).toEqual({ reason: 'fiftyMove' });
	});
});

describe('canStillCheckmate (FIDE 6.9, CR-6)', () => {
	// `canStillCheckmate(chess, color)`: could `color` mate by ANY legal sequence?
	const can = (fen: string, color: 'white' | 'black') => canStillCheckmate(new Chess(fen), color);

	it('a lone king can never mate', () => {
		expect(can('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'black')).toBe(false);
	});

	it('K+N or K+B against a lone king cannot mate', () => {
		expect(can('8/8/8/4k3/8/8/8/3NK3 w - - 0 1', 'white')).toBe(false);
		expect(can('8/8/8/4k3/8/8/8/3BK3 w - - 0 1', 'white')).toBe(false);
	});

	it('bishops all on one square colour cannot mate a lone king', () => {
		// c1 and e3 are both dark squares.
		expect(can('8/8/8/4k3/8/4B3/8/2B1K3 w - - 0 1', 'white')).toBe(false);
	});

	it('bishops on both colours, two knights, or any major piece / pawn can', () => {
		expect(can('8/8/8/4k3/8/8/8/2BBK3 w - - 0 1', 'white')).toBe(true);
		expect(can('8/8/8/4k3/8/8/8/2NNK3 w - - 0 1', 'white')).toBe(true);
		expect(can('8/8/8/4k3/8/8/8/3RK3 w - - 0 1', 'white')).toBe(true);
		expect(can('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1', 'white')).toBe(true);
	});

	it('a minor piece can still helpmate when the loser has material to block with', () => {
		expect(can('8/8/8/4k3/8/8/2n5/3QK3 w - - 0 1', 'black')).toBe(true);
		expect(can('8/8/8/4k3/8/8/4p3/3NK3 w - - 0 1', 'white')).toBe(true);
		expect(can('8/8/3n4/4k3/8/8/8/3BK3 w - - 0 1', 'white')).toBe(true);
	});

	it('same-coloured bishops on both sides is a dead position', () => {
		// White bishop c1 (dark), black bishop f8 (dark).
		expect(can('5b2/8/8/4k3/8/8/8/2B1K3 w - - 0 1', 'white')).toBe(false);
		// Black bishop on a light square: a helpmate exists.
		expect(can('4b3/8/8/4k3/8/8/8/2B1K3 w - - 0 1', 'white')).toBe(true);
	});
});
