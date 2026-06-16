import { describe, it, expect } from 'vitest';
import { ChessCore } from './ChessCore';

describe('ChessCore', () => {
	it('applies a legal move and advances the turn', () => {
		const core = new ChessCore();
		expect(core.turn()).toBe('white');
		const move = core.move({ from: 'e2', to: 'e4' });
		expect(move).not.toBeNull();
		expect(core.turn()).toBe('black');
		expect(core.history()).toEqual(['e4']);
	});

	it('returns null for an illegal move without throwing', () => {
		const core = new ChessCore();
		expect(core.move({ from: 'e2', to: 'e5' })).toBeNull();
		expect(core.turn()).toBe('white'); // unchanged
	});

	it('detects a promotion move and leaves the position untouched', () => {
		const core = new ChessCore('8/P7/8/8/8/8/8/k6K w - - 0 1');
		const fenBefore = core.fen();
		expect(core.isPromotion('a7', 'a8')).toBe(true);
		expect(core.fen()).toBe(fenBefore); // probe was undone
	});

	it('classifies move types', () => {
		const core = new ChessCore();
		expect(core.moveType(core.move({ from: 'e2', to: 'e4' })!)).toBe('normal');
		core.move({ from: 'd7', to: 'd5' });
		expect(core.moveType(core.move({ from: 'e4', to: 'd5' })!)).toBe('capture');
	});

	it('reports checkmate outcome with the winner (fool\'s mate)', () => {
		const core = new ChessCore();
		core.move({ from: 'f2', to: 'f3' });
		core.move({ from: 'e7', to: 'e5' });
		core.move({ from: 'g2', to: 'g4' });
		core.move({ from: 'd8', to: 'h4' });
		expect(core.outcome()).toEqual({ isOver: true, winner: 'black', reason: 'checkmate' });
	});

	it('distinguishes stalemate from a generic draw', () => {
		const core = new ChessCore('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
		expect(core.outcome()).toEqual({ isOver: true, winner: 'draw', reason: 'stalemate' });
	});

	it('reports the fifty-move rule via the halfmove clock', () => {
		const core = new ChessCore('4k3/8/8/8/8/8/4P3/4K3 w - - 100 60');
		expect(core.outcome()).toEqual({ isOver: true, winner: 'draw', reason: 'fiftyMove' });
	});

	it('returns null outcome for an ongoing game', () => {
		expect(new ChessCore().outcome()).toBeNull();
	});

	it('reset restores the starting position', () => {
		const core = new ChessCore();
		core.move({ from: 'e2', to: 'e4' });
		core.reset();
		expect(core.turn()).toBe('white');
		expect(core.history()).toEqual([]);
	});
});
