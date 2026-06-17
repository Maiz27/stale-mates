import { describe, it, expect } from 'vitest';
import { formatResult } from './formatResult';

describe('formatResult', () => {
	it('returns an empty string while the game is in progress', () => {
		expect(formatResult({ isOver: false, winner: null })).toBe('');
	});

	it('announces a win by reason', () => {
		expect(formatResult({ isOver: true, winner: 'white', reason: 'checkmate' })).toBe(
			'Game Over: White wins by checkmate'
		);
		expect(formatResult({ isOver: true, winner: 'black', reason: 'resignation' })).toBe(
			'Game Over: Black wins by resignation'
		);
	});

	it('announces a win with no reason', () => {
		expect(formatResult({ isOver: true, winner: 'white' })).toBe('Game Over: White wins!');
	});

	it('labels specific draw reasons', () => {
		expect(formatResult({ isOver: true, winner: 'draw', reason: 'stalemate' })).toBe(
			'Game Over: Stalemate'
		);
		expect(formatResult({ isOver: true, winner: 'draw', reason: 'threefold' })).toBe(
			'Game Over: Draw by repetition'
		);
	});

	it('falls back to a plain draw for the generic reason', () => {
		expect(formatResult({ isOver: true, winner: 'draw', reason: 'draw' })).toBe('Game Over: Draw');
		expect(formatResult({ isOver: true, winner: 'draw' })).toBe('Game Over: Draw');
	});
});
