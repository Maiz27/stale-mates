import { describe, it, expect } from 'vitest';
import { buildPgn, describeMove, movetext, resultToken } from './pgn';

const over = (winner: 'white' | 'black' | 'draw') => ({ isOver: true, winner });
const live = { isOver: false, winner: null };

describe('resultToken', () => {
	it('maps outcomes to PGN tokens', () => {
		expect(resultToken(over('white'))).toBe('1-0');
		expect(resultToken(over('black'))).toBe('0-1');
		expect(resultToken(over('draw'))).toBe('1/2-1/2');
		expect(resultToken(live)).toBe('*');
	});
});

describe('buildPgn', () => {
	it('writes the seven tag roster, movetext and result', () => {
		const pgn = buildPgn({
			moves: ['f3', 'e5', 'g4', 'Qh4#'],
			white: 'You',
			black: 'Stockfish "Expert"',
			result: over('black'),
			event: 'Stalemates vs AI',
			date: new Date(2026, 0, 5)
		});
		expect(pgn).toContain('[Event "Stalemates vs AI"]');
		expect(pgn).toContain('[Date "2026.01.05"]');
		expect(pgn).toContain('[White "You"]');
		expect(pgn).toContain('[Black "Stockfish \\"Expert\\""]');
		expect(pgn).toContain('[Result "0-1"]');
		expect(pgn.trim().endsWith('1. f3 e5 2. g4 Qh4# 0-1')).toBe(true);
	});

	it('wraps long movetext at 80 columns', () => {
		const moves = Array.from({ length: 60 }, (_, i) => (i % 2 ? 'Nf6' : 'Nf3'));
		const text = movetext(moves, live);
		for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(80);
		expect(text.endsWith('*')).toBe(true);
	});
});

describe('describeMove', () => {
	it('names the side and spells out check / mate', () => {
		expect(describeMove(0, 'e4')).toBe('White played e4');
		expect(describeMove(1, 'Bb4+')).toBe('Black played Bb4, check');
		expect(describeMove(3, 'Qh4#')).toBe('Black played Qh4, checkmate');
	});
});

describe('resultToken: aborted games (CR3-4)', () => {
	it('records an aborted game as "*" (no result)', () => {
		expect(resultToken({ isOver: true, winner: null, reason: 'aborted' })).toBe('*');
	});
});
