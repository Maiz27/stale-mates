import { describe, it, expect } from 'vitest';
import { parseMoveInput } from './moveInput';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PROMO = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
const CASTLE = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

describe('parseMoveInput', () => {
	it('parses SAN', () => {
		expect(parseMoveInput('e4', START)).toEqual({ ok: true, move: { from: 'e2', to: 'e4' } });
		expect(parseMoveInput('Nf3', START)).toEqual({ ok: true, move: { from: 'g1', to: 'f3' } });
		expect(parseMoveInput('nf3', START)).toEqual({ ok: true, move: { from: 'g1', to: 'f3' } });
	});

	it('parses coordinates with or without separators', () => {
		expect(parseMoveInput('e2e4', START)).toEqual({ ok: true, move: { from: 'e2', to: 'e4' } });
		expect(parseMoveInput('E2-E4', START)).toEqual({ ok: true, move: { from: 'e2', to: 'e4' } });
	});

	it('handles castling, including zeros', () => {
		expect(parseMoveInput('O-O', CASTLE)).toEqual({ ok: true, move: { from: 'e1', to: 'g1' } });
		expect(parseMoveInput('0-0-0', CASTLE)).toEqual({ ok: true, move: { from: 'e1', to: 'c1' } });
	});

	it('handles promotion in both notations', () => {
		expect(parseMoveInput('a8=N', PROMO)).toEqual({
			ok: true,
			move: { from: 'a7', to: 'a8', promotion: 'n' }
		});
		expect(parseMoveInput('a7a8q', PROMO)).toEqual({
			ok: true,
			move: { from: 'a7', to: 'a8', promotion: 'q' }
		});
		// No piece given: returned without promotion so the UI can ask.
		expect(parseMoveInput('a7a8', PROMO)).toEqual({ ok: true, move: { from: 'a7', to: 'a8' } });
	});

	it('rejects illegal or garbage input with a message', () => {
		for (const bad of ['', 'e5', 'e2e5', 'Ke2', 'hello', 'z9z9']) {
			const result = parseMoveInput(bad, START);
			expect(result.ok).toBe(false);
		}
	});
});
