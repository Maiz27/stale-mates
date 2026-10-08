import { GameModel } from './GameModel';
import type { Stockfish } from '../engine/Stockfish';
import type { GameSettings } from '$lib/stores/gameSettings';
import type { Color } from 'chessground/types';
import type { ChessMove } from './types';
import { initializeEngine } from './utils';

/** The engine surface AIGameState drives (lets tests inject a fake). */
export type AIEngine = Pick<
	Stockfish,
	| 'newGame'
	| 'stop'
	| 'setPosition'
	| 'go'
	| 'getHint'
	| 'setDifficulty'
	| 'terminate'
	| 'getSearchGeneration'
	| 'getBestMove'
>;

export interface AIGameStateOptions {
	player: Color;
	difficulty: number;
	debug: boolean;
	/** Factory for the engine; receives the bestmove and failure callbacks. Defaults to Stockfish. */
	createEngine?: (
		onMessage: (message: string) => void,
		difficulty: number,
		onError: (error: unknown) => void
	) => AIEngine;
}

/** What's persisted to resume an AI game after a refresh. */
export type SavedAIGame = { version: 1; player: Color; moves: string[] };

export class AIGameState extends GameModel {
	private engine: AIEngine;
	private difficulty: number;
	private requestedSearchGeneration: number = 0;
	// Bumped on every position change so a hint computed for an older position is dropped.
	private hintToken = 0;

	private readonly startEngine: () => AIEngine;

	constructor({ player, difficulty, debug = false, createEngine }: AIGameStateOptions) {
		super('pve', player);
		this.difficulty = difficulty;
		this.startEngine = () => {
			// Callbacks are bound to the engine they came from, so a failed engine's
			// late events can't affect its replacement.
			let engine: AIEngine | null = null;
			const onMessage = (message: string) => {
				if (engine === this.engine) this.handleEngineMessage(message);
			};
			const onError = (error: unknown) => {
				if (engine === null || engine === this.engine) this.handleEngineError(error);
			};
			engine = createEngine
				? createEngine(onMessage, this.difficulty, onError)
				: initializeEngine(onMessage, this.difficulty, debug, onError);
			return engine;
		};
		this.engine = this.startEngine();
	}

	/**
	 * Replace a failed engine with a fresh one and pick the game back up: the
	 * position is re-sent and, if it's the AI's turn, it moves (CR-10).
	 */
	retryEngine() {
		this.engine.terminate();
		this.patch({ engineError: false });
		this.engine = this.startEngine();
		this.resetEngine();
		this.triggerAiMove();
	}

	/** The engine failed (worker error, WASM didn't load, or never became ready). */
	private handleEngineError(error: unknown) {
		console.error('Chess engine failed:', error);
		this.hintToken++;
		this.patch({ engineError: true, thinking: false, hint: null, hintPending: false });
	}

	newGame() {
		super.newGame();
		this.resetEngine();
		this.playCue('game-start');
		if (this.player === 'black') {
			this.triggerAiMove();
		}
	}

	/** Stop the engine too, so a search started before the reset can't land afterwards. */
	endGame() {
		super.endGame();
		this.resetEngine();
	}

	makeMove(move: ChessMove): boolean {
		const result = super.makeMove(move);
		if (result) {
			this.hintToken++;
			this.engine.setPosition(this.core.fen());
			if (this.snapshot().gameOver.isOver) {
				this.patch({ thinking: false });
				this.playCue('game-end');
			} else {
				this.triggerAiMove();
			}
		}
		return result;
	}

	/** Whether the player has a move of their own on the board to take back. */
	canUndo(): boolean {
		const view = this.snapshot();
		const playerMoves = Math.floor(
			(view.moveHistory.length + (this.player === 'white' ? 1 : 0)) / 2
		);
		return view.started && !view.gameOver.isOver && playerMoves > 0;
	}

	/**
	 * Take back the player's last move: one ply if the AI is still thinking about
	 * its reply, two plies (AI reply + player move) otherwise. Always lands on the
	 * player's turn — or, if the history runs out before that, restarts the AI's
	 * search so the game can't stall (audit SM-2.1).
	 */
	undoMove() {
		if (!this.canUndo()) return;
		this.engine.stop();
		this.hintToken++;

		let history = this.snapshot().moveHistory;
		while (history.length > 0) {
			this.core.undo();
			history = history.slice(0, -1);
			if (this.core.turn() === this.player) break;
		}
		this.patch({ moveHistory: history, hint: null, hintPending: false, thinking: false });
		this.updateGameState();
		this.engine.setPosition(this.core.fen());
		this.triggerAiMove();
	}

	async getHint(): Promise<ChessMove | null> {
		const view = this.snapshot();
		if (!view.started || view.gameOver.isOver || this.player !== view.turn || view.hintPending) {
			return null;
		}
		const token = ++this.hintToken;
		this.patch({ hintPending: true, hint: null });
		const hintMove = await this.engine.getHint(this.player === 'white' ? 'w' : 'b');
		// Drop a hint for a position that's gone (the player moved/undid meanwhile).
		if (token !== this.hintToken) return null;
		this.patch({ hint: hintMove, hintPending: false });
		return hintMove;
	}

	clearHint(): void {
		this.hintToken++;
		this.patch({ hint: null, hintPending: false });
	}

	setDifficulty(difficulty: number) {
		this.difficulty = difficulty;
		this.engine.setDifficulty(difficulty);
	}

	updateSettings(settings: GameSettings) {
		// Color only takes effect when no game is in progress (before the first
		// game or after one has finished). Reassigning it mid-game would make the
		// AI move for the human's side. The board reads `view.player`, so the
		// orientation always follows the model, never the settings store
		// (audit SM-2.4 / M2). Difficulty is safe to change anytime.
		const view = this.snapshot();
		const inProgress = view.started && !view.gameOver.isOver;
		if (!inProgress && settings.color && settings.color !== this.player) {
			this.player = settings.color;
			this.patch({ player: settings.color });
		}
		this.setDifficulty(settings.difficulty);
	}

	resign() {
		const view = this.snapshot();
		if (!view.started || view.gameOver.isOver) return;
		this.engine.stop();
		const winner: Color = this.player === 'white' ? 'black' : 'white';
		this.patch({
			gameOver: { isOver: true, winner, reason: 'resignation' },
			thinking: false,
			hint: null,
			hintPending: false
		});
		this.playCue('game-end');
	}

	destroy() {
		this.engine.terminate();
		super.destroy();
	}

	/** Snapshot of an in-progress game for persistence, or null if nothing to save. */
	serialize(): SavedAIGame | null {
		const view = this.snapshot();
		if (!view.started || view.gameOver.isOver) return null;
		return {
			version: 1,
			player: this.player,
			moves: view.moveHistory.map((m) => `${m.from}${m.to}${m.promotion ?? ''}`)
		};
	}

	/**
	 * Resume a saved game: replay its moves, take the saved side and, if it's the
	 * AI's turn, let it move. Returns false (leaving a fresh board) if the save
	 * is invalid.
	 */
	restore(saved: unknown): boolean {
		if (!isSavedAIGame(saved)) return false;
		if (!this.core.replay(saved.moves) || this.core.isGameOver()) {
			this.core.reset();
			this.updateGameState();
			return false;
		}
		this.player = saved.player;
		this.patch({
			player: saved.player,
			started: true,
			gameOver: { isOver: false, winner: null },
			moveHistory: this.core.moves(),
			promotionMove: null,
			hint: null
		});
		this.updateGameState();
		this.resetEngine();
		this.triggerAiMove();
		return true;
	}

	private resetEngine() {
		this.hintToken++;
		this.engine.stop();
		this.engine.newGame();
		this.engine.setPosition(this.core.fen());
		this.patch({ thinking: false, hint: null, hintPending: false });
	}

	private triggerAiMove() {
		const view = this.snapshot();
		if (!view.started || view.gameOver.isOver) return;
		if (this.player !== view.turn) {
			// Capture the generation for the search we're about to request so a
			// stale bestmove (e.g. after an undo) can be detected and ignored.
			this.requestedSearchGeneration = this.engine.getSearchGeneration();
			this.patch({ thinking: true });
			this.engine.go();
		}
	}

	private handleEngineMessage(message: string) {
		if (!message.startsWith('bestmove')) return;

		// Don't apply a bestmove to a game that has already ended.
		if (this.snapshot().gameOver.isOver) return;

		// Ignore stale results: if the engine's generation advanced (undo/newGame/stop
		// bumped it) the bestmove belongs to a cancelled search.
		if (this.engine.getSearchGeneration() !== this.requestedSearchGeneration) return;
		if (this.snapshot().turn === this.player) return;

		this.patch({ thinking: false });
		const { from, to, promotion } = this.engine.getBestMove();
		if (!from || !to) return;

		const move: ChessMove = this.isPromotionMove(from, to)
			? { from, to, promotion: promotion || 'q' }
			: { from, to };
		this.makeMove(move);
	}
}

function isSavedAIGame(value: unknown): value is SavedAIGame {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return (
		v.version === 1 &&
		(v.player === 'white' || v.player === 'black') &&
		Array.isArray(v.moves) &&
		v.moves.every((m) => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))
	);
}
