import { describe, it, expect } from 'vitest';
import { parseClientMessage } from './validate';

describe('parseClientMessage', () => {
	it('accepts and normalises a legal-looking move', () => {
		expect(
			parseClientMessage(
				JSON.stringify({ type: 'move', move: { from: 'e7', to: 'e8', promotion: 'n', x: 1 }, y: 2 })
			)
		).toEqual({ type: 'move', move: { from: 'e7', to: 'e8', promotion: 'n' } });
	});

	it('rejects bad squares, promotions and types', () => {
		const bad = [
			{ type: 'move', move: { from: 'e9', to: 'e4' } },
			{ type: 'move', move: { from: 'e2', to: 4 } },
			{ type: 'move', move: { from: 'e7', to: 'e8', promotion: 'k' } },
			{ type: 'move', move: { from: 'e7', to: 'e8', promotion: 'queen' } },
			{ type: 'move' },
			{ type: 'gameOver', winner: 'white', reason: 'timeout' },
			{ type: 'join', token: '' },
			{ type: 'join', token: 'x'.repeat(200) },
			{ type: 42 },
			[],
			null
		];
		for (const frame of bad) {
			expect(parseClientMessage(JSON.stringify(frame))).toBeNull();
		}
		expect(parseClientMessage('{not json')).toBeNull();
	});

	it('strips extra fields from simple messages', () => {
		expect(parseClientMessage(JSON.stringify({ type: 'resign', playerId: 'spoof' }))).toEqual({
			type: 'resign'
		});
	});

	it('accepts a well-formed join token', () => {
		expect(parseClientMessage(JSON.stringify({ type: 'join', token: 'abcDEF123_-xyz' }))).toEqual({
			type: 'join',
			token: 'abcDEF123_-xyz'
		});
	});
});
