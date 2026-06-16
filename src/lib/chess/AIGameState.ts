import { get } from 'svelte/store';
import { GameState } from './GameState';
import type { Stockfish } from '../engine/Stockfish';
import type { GameSettings } from '$lib/stores/gameSettings';
import type { Color } from 'chessground/types';
import type { ChessMove } from './types';
import { initializeEngine } from './utils';

export interface AIGameStateOptions {
	player: Color;
	difficulty: number;
	debug: boolean;
}

export class AIGameState extends GameState {
	private engine: Stockfish;
	private difficulty: number;
	private requestedSearchGeneration: number = 0;

	constructor({ player, difficulty, debug = false }: AIGameStateOptions) {
		super('pve', player);
		this.difficulty = difficulty;
		this.engine = initializeEngine(this.handleEngineMessage.bind(this), difficulty, debug);
	}

	newGame() {
		super.newGame();
		this.engine.stop();
		this.engine.newGame();
		this.engine.setPosition(this.core.fen());
		if (this.player === 'black') {
			this.triggerAiMove();
		}
	}

	makeMove(move: ChessMove): boolean {
		const result = super.makeMove(move);
		if (result) {
			this.engine.setPosition(this.core.fen());
			this.triggerAiMove();
		}
		return result;
	}

	undoMove() {
		this.engine.stop();
		this.core.undo();
		this.core.undo();
		this.moveHistory.update((history) => history.slice(0, -2));
		this.updateGameState();
		this.engine.setPosition(this.core.fen());
	}

	async getHint(): Promise<ChessMove | null> {
		if (!get(this.started) || this.player !== get(this.turn)) return null;
		const hintMove = await this.engine.getHint(this.player === 'white' ? 'w' : 'b');
		this.hint.set(hintMove);
		return hintMove;
	}

	setDifficulty(difficulty: number) {
		this.difficulty = difficulty;
		this.engine.setDifficulty(difficulty);
	}

	updateSettings(settings: GameSettings) {
		// Color only takes effect on a fresh game. Reassigning `player` mid-game
		// would desync it from the board orientation/input color, which
		// `ChessBoard` likewise only updates while `!started` — the AI would then
		// start moving for the human's side. Difficulty is safe to change anytime.
		if (!get(this.started)) {
			this.player = settings.color!;
		}
		this.setDifficulty(settings.difficulty);
	}

	resign() {
		this.engine.stop();
		const winner: Color = this.player === 'white' ? 'black' : 'white';
		this.gameOver.set({ isOver: true, winner, reason: 'resignation' });
		this.audioCue.set('game-end');
	}

	destroy() {
		this.engine.terminate();
		super.destroy();
	}

	private triggerAiMove() {
		if (get(this.gameOver).isOver) return;
		if (this.player !== get(this.turn)) {
			// Capture the generation for the search we're about to request so a
			// stale bestmove (e.g. after an undo) can be detected and ignored.
			this.requestedSearchGeneration = this.engine.getSearchGeneration();
			this.engine.go();
		}
	}

	private handleEngineMessage(message: string) {
		if (!message.includes('bestmove')) return;

		// Don't apply a bestmove to a game that has already ended.
		if (get(this.gameOver).isOver) return;

		// Ignore stale results: if the engine's generation advanced (undo/newGame/stop
		// bumped it) the bestmove belongs to a cancelled search.
		if (this.engine.getSearchGeneration() !== this.requestedSearchGeneration) return;
		if (get(this.turn) === this.player) return;

		const { from, to, promotion } = this.engine.getBestMove();
		if (!from || !to) return;

		const move: ChessMove = this.isPromotionMove(from, to)
			? { from, to, promotion: promotion || 'q' }
			: { from, to };
		this.makeMove(move);
	}
}
