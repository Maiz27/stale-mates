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

	constructor({ player, difficulty, debug = false }: AIGameStateOptions) {
		super('pve', player);
		this.difficulty = difficulty;
		this.engine = initializeEngine(this.handleEngineMessage.bind(this), difficulty, debug);
	}

	newGame() {
		super.newGame();
		this.engine.newGame();
		this.engine.setPosition(this.chess.fen());
		if (this.player === 'black') {
			this.triggerAiMove();
		}
	}

	makeMove(move: ChessMove): boolean {
		const result = super.makeMove(move);
		if (result) {
			this.engine.setPosition(this.chess.fen());
			this.triggerAiMove();
		}
		return result;
	}

	undoMove() {
		this.chess.undo();
		this.chess.undo();
		this.moveHistory.update((history) => history.slice(0, -2));
		this.updateGameState();
		this.engine.setPosition(this.chess.fen());
	}

	async getHint(): Promise<ChessMove | null> {
		if (!this.started || this.player !== get(this.turn)) return null;
		const hintMove = await this.engine.getHint(this.player === 'white' ? 'w' : 'b');
		this.hint.set(hintMove);
		return hintMove;
	}

	setDifficulty(difficulty: number) {
		this.difficulty = difficulty;
		this.engine.setDifficulty(difficulty);
	}

	updateSettings(settings: GameSettings) {
		this.player = settings.color!;
		this.setDifficulty(settings.difficulty);
	}

	private triggerAiMove() {
		if (this.player !== get(this.turn)) {
			this.engine.go();
		}
	}

	private handleEngineMessage(message: string) {
		if (message.includes('bestmove')) {
			const { from, to } = this.engine.getBestMove();
			if (get(this.turn) !== this.player) {
				const move = this.isPromotionMove(from, to) ? { from, to, promotion: 'q' } : { from, to };
				this.makeMove(move);
			}
		}
	}
}
