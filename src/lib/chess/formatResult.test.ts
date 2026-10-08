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

describe('formatResult: aborted games (CR3-4, CR4-2, CR4-3)', () => {
	const aborted = (cause: 'firstMoveTimeout' | 'noShow' | 'player', by: 'white' | 'black') => ({
		isOver: true,
		winner: null,
		reason: 'aborted' as const,
		abort: { cause, by }
	});

	it('announces an abort without a winner', () => {
		expect(formatResult({ isOver: true, winner: null, reason: 'aborted' })).toBe(
			'Game Over: Aborted'
		);
		expect(formatResult(aborted('firstMoveTimeout', 'white'), 'black')).toBe(
			'Game Over: Aborted — no first move in time'
		);
		expect(formatResult(aborted('firstMoveTimeout', 'white'), 'white')).toBe(
			'Game Over: Aborted — no first move in time'
		);
	});

	it('says the opponent did not show up, from each side', () => {
		expect(formatResult(aborted('noShow', 'white'), 'black')).toBe(
			"Game Over: Opponent didn't show up — game aborted"
		);
		expect(formatResult(aborted('noShow', 'white'), 'white')).toBe(
			'Game Over: Aborted — you were away before your first move'
		);
		expect(formatResult(aborted('noShow', 'black'))).toBe(
			"Game Over: Aborted — Black didn't show up"
		);
	});

	it('says who aborted the game', () => {
		expect(formatResult(aborted('player', 'white'), 'white')).toBe(
			'Game Over: You aborted the game'
		);
		expect(formatResult(aborted('player', 'white'), 'black')).toBe(
			'Game Over: Your opponent aborted the game'
		);
		expect(formatResult(aborted('player', 'black'))).toBe('Game Over: Aborted by Black');
	});
});
