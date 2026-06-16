import { describe, it, expect, beforeAll, vi } from 'vitest';
import { get } from 'svelte/store';
import { GameModel } from './GameModel';

// AudioCue constructs real HTMLAudioElements; stub them for the node test env.
beforeAll(() => {
	vi.stubGlobal(
		'Audio',
		class {
			volume = 0;
			src = '';
			load() {}
			pause() {}
			play() {
				return Promise.resolve();
			}
		}
	);
});

describe('GameModel', () => {
	it('exposes the position as a readable view', () => {
		const model = new GameModel('pve', 'white');
		const view = get(model);
		expect(view.turn).toBe('white');
		expect(view.started).toBe(false);
		expect(view.moveHistory).toEqual([]);
	});

	it('records a move in both move and SAN history', () => {
		const model = new GameModel('pve', 'white');
		expect(model.makeMove({ from: 'e2', to: 'e4' })).toBe(true);
		const view = get(model);
		expect(view.moveHistory).toEqual([{ from: 'e2', to: 'e4', promotion: undefined }]);
		expect(view.sanHistory).toEqual(['e4']);
		expect(view.turn).toBe('black');
	});

	it('clears move history on newGame so a stale undo guard cannot survive a reset', () => {
		const model = new GameModel('pve', 'white');
		model.makeMove({ from: 'e2', to: 'e4' });
		model.makeMove({ from: 'e7', to: 'e5' });
		expect(get(model).moveHistory.length).toBe(2);

		model.newGame();
		const view = get(model);
		expect(view.moveHistory).toEqual([]);
		expect(view.sanHistory).toEqual([]);
		expect(view.started).toBe(true);
	});

	it('clears move history on endGame', () => {
		const model = new GameModel('pve', 'white');
		model.makeMove({ from: 'e2', to: 'e4' });
		model.endGame();
		const view = get(model);
		expect(view.moveHistory).toEqual([]);
		expect(view.sanHistory).toEqual([]);
		expect(view.started).toBe(false);
		expect(view.gameOver.isOver).toBe(false);
	});
});
