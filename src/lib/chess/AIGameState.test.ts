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
	histories: { fen: string; moves: string[] }[] = [];
	best: ChessMove = { from: '', to: '' };
	hintResolve: ((m: ChessMove | null) => void) | null = null;
	terminated = false;
	constructor(
		private onMessage: (m: string) => void,
		readonly onError: (e: unknown) => void = () => {}
	) {}
	newGame() {
		this.generation++;
	}
	stop() {
		this.stopCalls++;
		this.generation++;
	}
	setPosition(fen: string, moves: string[] = []) {
		this.positions.push(fen);
		this.histories.push({ fen, moves });
	}
	go() {
		this.goCalls++;
	}
	getHint() {
		return new Promise<ChessMove | null>((resolve) => (this.hintResolve = resolve));
	}
	setDifficulty() {}
	terminate() {
		this.terminated = true;
	}
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

describe('AIGameState persistence (SM-5)', () => {
	it('round-trips an in-progress game and resumes the AI if it is its turn', () => {
		const { game } = setup();
		game.newGame();
		game.makeMove({ from: 'e2', to: 'e4' });
		const saved = game.serialize();
		expect(saved).toEqual({ version: 1, player: 'white', moves: ['e2e4'] });

		const { game: restored, engine: engine2 } = setup('black');
		expect(restored.restore(JSON.parse(JSON.stringify(saved)))).toBe(true);
		const view = get(restored);
		expect(view.player).toBe('white');
		expect(view.sanHistory).toEqual(['e4']);
		expect(view.started).toBe(true);
		expect(engine2().goCalls).toBe(1); // black (AI) to move
	});

	it('rejects corrupt saves', () => {
		const { game } = setup();
		expect(game.restore({ version: 1, player: 'white', moves: ['e2e5'] })).toBe(false);
		expect(game.restore({ version: 2 })).toBe(false);
		expect(game.restore('nope')).toBe(false);
		expect(get(game).started).toBe(false);
	});

	it('does not save finished or unstarted games', () => {
		const { game } = setup();
		expect(game.serialize()).toBeNull();
		game.newGame();
		game.resign();
		expect(game.serialize()).toBeNull();
	});
});

describe('AIGameState engine failure (CR-10)', () => {
	function setupWithEngines(player: 'white' | 'black' = 'black') {
		const engines: FakeEngine[] = [];
		const game = new AIGameState({
			player,
			difficulty: 5,
			debug: false,
			createEngine: (onMessage, _difficulty, onError) => {
				const engine = new FakeEngine(onMessage, onError);
				engines.push(engine);
				return engine;
			}
		});
		return { game, engines };
	}

	it('stops "Thinking…" and surfaces an error when the engine fails', () => {
		const { game, engines } = setupWithEngines('black');
		game.newGame(); // AI (white) to move
		expect(get(game).thinking).toBe(true);
		engines[0].onError(new Error('wasm failed to load'));
		expect(get(game).thinking).toBe(false);
		expect(get(game).engineError).toBe(true);
	});

	it('retry starts a fresh engine and resumes the AI move', () => {
		const { game, engines } = setupWithEngines('black');
		game.newGame();
		engines[0].onError(new Error('boom'));
		game.retryEngine();
		expect(engines[0].terminated).toBe(true);
		expect(engines).toHaveLength(2);
		expect(get(game).engineError).toBe(false);
		expect(get(game).thinking).toBe(true);
		expect(engines[1].goCalls).toBe(1);
		engines[1].reply({ from: 'e2', to: 'e4' });
		expect(get(game).moveHistory).toHaveLength(1);
	});
});

describe('AIGameState engine position (CR2-9)', () => {
	const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

	it('gives the engine the start position plus every move, not just the current FEN', () => {
		const { game, engine } = setup();
		game.newGame();
		game.makeMove({ from: 'g1', to: 'f3' });
		engine().reply({ from: 'g8', to: 'f6' });
		game.makeMove({ from: 'f3', to: 'g1' });
		expect(engine().histories.at(-1)).toEqual({
			fen: START,
			moves: ['g1f3', 'g8f6', 'f3g1']
		});
	});

	it('keeps the history across undo and a restored game', () => {
		const { game, engine } = setup();
		expect(game.restore({ version: 1, player: 'white', moves: ['e2e4', 'e7e5', 'g1f3'] })).toBe(
			true
		);
		expect(engine().histories.at(-1)).toEqual({ fen: START, moves: ['e2e4', 'e7e5', 'g1f3'] });
		engine().reply({ from: 'b8', to: 'c6' });
		game.undoMove();
		expect(engine().histories.at(-1)).toEqual({ fen: START, moves: ['e2e4', 'e7e5'] });
	});
});
