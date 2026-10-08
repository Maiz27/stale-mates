import { describe, it, expect, beforeAll, vi } from 'vitest';
import { get } from 'svelte/store';
import { AIGameState, type AIEngine } from './AIGameState';
import type { ChessMove } from './types';

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

/** Scripted engine: records calls; tests decide when/what bestmove arrives. */
class FakeEngine implements AIEngine {
	generation = 0;
	goCalls = 0;
	stopCalls = 0;
	positions: string[] = [];
	best: ChessMove = { from: '', to: '' };
	hintResolve: ((m: ChessMove | null) => void) | null = null;
	constructor(private onMessage: (m: string) => void) {}
	newGame() {
		this.generation++;
	}
	stop() {
		this.stopCalls++;
		this.generation++;
	}
	setPosition(fen: string) {
		this.positions.push(fen);
	}
	go() {
		this.goCalls++;
	}
	getHint() {
		return new Promise<ChessMove | null>((resolve) => (this.hintResolve = resolve));
	}
	setDifficulty() {}
	terminate() {}
	getSearchGeneration() {
		return this.generation;
	}
	getBestMove() {
		return this.best;
	}
	reply(move: ChessMove) {
		this.best = move;
		this.onMessage(`bestmove ${move.from}${move.to}${move.promotion ?? ''}`);
	}
}

function setup(player: 'white' | 'black' = 'white') {
	let engine!: FakeEngine;
	const game = new AIGameState({
		player,
		difficulty: 5,
		debug: false,
		createEngine: (onMessage) => (engine = new FakeEngine(onMessage))
	});
	return { game, engine: () => engine };
}

describe('AIGameState undo (SM-2.1)', () => {
	it('undoes one ply while the AI is still thinking and lands on the player turn', () => {
		const { game, engine } = setup();
		game.newGame();
		game.makeMove({ from: 'e2', to: 'e4' });
		expect(get(game).thinking).toBe(true);

		game.undoMove();
		const view = get(game);
		expect(view.moveHistory).toEqual([]);
		expect(view.turn).toBe('white');
		expect(view.thinking).toBe(false);

		// The cancelled search's bestmove must not be applied.
		engine().generation = 0; // even if generations collide, turn guard holds
		engine().reply({ from: 'e7', to: 'e5' });
		expect(get(game).moveHistory).toEqual([]);
	});

	it('undoes two plies (AI reply + player move) on the player turn', () => {
		const { game, engine } = setup();
		game.newGame();
		game.makeMove({ from: 'e2', to: 'e4' });
		engine().reply({ from: 'e7', to: 'e5' });
		expect(get(game).moveHistory).toHaveLength(2);

		game.undoMove();
		expect(get(game).moveHistory).toEqual([]);
		expect(get(game).turn).toBe('white');
	});

	it('is unavailable before the player has moved (black, AI to open)', () => {
		const { game, engine } = setup('black');
		game.newGame();
		expect(game.canUndo()).toBe(false);
		engine().reply({ from: 'e2', to: 'e4' });
		expect(game.canUndo()).toBe(false);
		game.makeMove({ from: 'e7', to: 'e5' });
		expect(game.canUndo()).toBe(true);
	});

	it('does not start an AI search when undo lands on the player turn', () => {
		const { game, engine } = setup();
		game.newGame();
		game.makeMove({ from: 'e2', to: 'e4' });
		engine().reply({ from: 'e7', to: 'e5' });
		const before = engine().goCalls;
		game.undoMove(); // back to white to move: no AI search needed
		expect(engine().goCalls).toBe(before);
	});
});

describe('AIGameState endGame (SM-2.1)', () => {
	it('stops the engine and ignores a bestmove from the previous game', () => {
		const { game, engine } = setup();
		game.newGame();
		game.makeMove({ from: 'e2', to: 'e4' });
		const stops = engine().stopCalls;
		game.endGame();
		expect(engine().stopCalls).toBeGreaterThan(stops);
		engine().reply({ from: 'e7', to: 'e5' });
		expect(get(game).moveHistory).toEqual([]);
		expect(get(game).thinking).toBe(false);
	});
});

describe('AIGameState colour (SM-2.4)', () => {
	it('applies a colour change after the game is over, not during play', () => {
		const { game } = setup();
		game.newGame();
		game.updateSettings({ color: 'black', difficulty: 5, hints: true, undo: true });
		expect(get(game).player).toBe('white');

		game.resign();
		game.updateSettings({ color: 'black', difficulty: 5, hints: true, undo: true });
		expect(get(game).player).toBe('black');
		expect(game.player).toBe('black');
	});
});

describe('AIGameState hints (SM-2.5)', () => {
	it('marks the hint pending and refuses a second request meanwhile', async () => {
		const { game, engine } = setup();
		game.newGame();
		const first = game.getHint();
		expect(get(game).hintPending).toBe(true);
		await expect(game.getHint()).resolves.toBeNull();

		engine().hintResolve?.({ from: 'g1', to: 'f3' });
		await expect(first).resolves.toEqual({ from: 'g1', to: 'f3' });
		expect(get(game).hint).toEqual({ from: 'g1', to: 'f3' });
		expect(get(game).hintPending).toBe(false);
	});

	it('drops a hint that arrives after the player already moved', async () => {
		const { game, engine } = setup();
		game.newGame();
		const pending = game.getHint();
		game.handlePlayerMove({ from: 'e2', to: 'e4' });
		engine().hintResolve?.({ from: 'g1', to: 'f3' });
		await pending;
		expect(get(game).hint).toBeNull();
	});
});
