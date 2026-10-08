import { describe, it, expect } from 'vitest';
import { loadSettings } from './gameSettings';

const storage = (value: string | null) => ({ getItem: () => value });

describe('loadSettings (SM-2.9)', () => {
	it('falls back to defaults for corrupt JSON', () => {
		expect(loadSettings(storage('{oops'))).toEqual({
			color: 'white',
			difficulty: 7,
			hints: true,
			undo: true
		});
	});

	it('sanitises individual fields', () => {
		expect(
			loadSettings(storage(JSON.stringify({ color: 'red', difficulty: 99, hints: false })))
		).toEqual({ color: 'white', difficulty: 7, hints: false, undo: true });
	});

	it('survives a storage that throws', () => {
		const throwing = {
			getItem: () => {
				throw new Error('SecurityError');
			}
		};
		expect(loadSettings(throwing).difficulty).toBe(7);
	});

	it('keeps valid persisted settings', () => {
		const saved = { color: 'black', difficulty: 15, hints: false, undo: false };
		expect(loadSettings(storage(JSON.stringify(saved)))).toEqual(saved);
	});
});
