import { writable, type Writable } from 'svelte/store';
import { Chess, type Square } from 'chess.js';
import type { Stockfish } from '$lib/engine/Stockfish';
import type { Color } from 'chessground/types';
import type { CheckState, ChessMove, GameMode, GameOver, PromotionMove } from './types';
import {
	initializeEngine,
	getCheckState,
	getChessJsColor,
	isPromotionMove,
	isVsAI,
	toDestinations
} from './utils';
import { STARTING_FEN } from '$lib/constants';
import type { GameSettings } from '$lib/stores/gameSettings';

export class GameState {
	private chess: Chess;
	private engine: Stockfish;
	private moveHistory: ChessMove[] = [];
	mode: GameMode;
	player: Color;

	started: Writable<boolean> = writable(false);
	promotionMove: Writable<PromotionMove> = writable(null);
	checkState: Writable<CheckState> = writable({ inCheck: false });
	gameOver: Writable<GameOver> = writable({ isOver: false, winner: null });
	fen: Writable<string>;
	turn: Writable<Color>;
	destinations: Writable<Map<Square, Square[]>> = writable(new Map());
	hint: Writable<ChessMove | null> = writable(null);

	constructor({
		debug = false,
		fen = STARTING_FEN,
		player = 'white' as Color,
		gameMode = 'pve' as GameMode,
		difficulty = 10
	}) {
		this.chess = new Chess(fen);
		this.engine = initializeEngine(this.handleEngineMessage.bind(this), difficulty, debug);
		this.mode = gameMode;
		this.player = player;
		this.fen = writable(fen);
		this.turn = writable(this.chess.turn() === 'w' ? 'white' : 'black');
		this.updateDestinations();
	}

	newGame() {
		this.chess.reset();
		this.updateGameState();
		this.engine.newGame();
		this.engine.setPosition(STARTING_FEN);
		this.started.set(true);
		this.triggerAiMove();
	}

	endGame() {
		this.chess.reset();
		this.updateGameState();
		this.started.set(false);
		this.gameOver.set({ isOver: false, winner: null });
	}

	async getHint() {
		if (!this.started || getChessJsColor(this.player) !== this.chess.turn()) return null;
		const hintMove = await this.engine.getHint(this.player === 'white' ? 'w' : 'b');
		this.hint.set(hintMove);
		return hintMove;
	}

	clearHint() {
		this.hint.set(null);
	}

	setDifficulty(difficulty: number) {
		this.engine.setDifficulty(difficulty);
	}

	updateSettings(settings: GameSettings) {
		this.player = settings.color!;
		this.setDifficulty(settings.difficulty);
	}

	handlePlayerMove({ from, to }: ChessMove) {
		if (isPromotionMove(this.chess, from, to)) {
			this.promotionMove.set({ from, to });
		} else {
			this.makeMove({ from, to });
		}
	}

	triggerAiMove() {
		if (isVsAI(this.mode) && getChessJsColor(this.player) !== this.chess.turn()) {
			this.engine.go();
		}
	}

	makeMove({ from, to, promotion }: ChessMove) {
		try {
			const move = this.chess.move({ from, to, promotion });
			if (move) {
				this.moveHistory.push({ from, to, promotion });
				this.updateGameState();
				this.engine.setPosition(this.chess.fen());
				this.triggerAiMove();
				return true;
			}
		} catch (error) {
			console.error('Invalid move:', { from, to, promotion }, error);
		}
		return false;
	}

	undoMove() {
		if (!isVsAI(this.mode)) {
			console.log('Undo is only available in Player vs AI mode');
			return;
		}

		if (this.moveHistory.length < 2) {
			console.log('Not enough moves to undo');
			return;
		}

		this.chess.undo();
		this.chess.undo();
		this.moveHistory.pop();
		this.moveHistory.pop();

		this.updateGameState();
		this.engine.setPosition(this.chess.fen());
	}

	private handleEngineMessage(message: string) {
		if (message.includes('bestmove')) {
			const { from, to } = this.engine.getBestMove();
			if (isVsAI(this.mode) && this.chess.turn() !== getChessJsColor(this.player)) {
				const move = isPromotionMove(this.chess, from, to)
					? { from, to, promotion: 'q' }
					: { from, to };
				this.makeMove(move);
			}
		}
	}

	private updateGameState() {
		this.fen.set(this.chess.fen());
		this.turn.set(this.chess.turn() === 'w' ? 'white' : 'black');
		this.updateDestinations();
		this.checkState.set(getCheckState(this.chess));
		this.checkGameOver();
	}

	private updateDestinations() {
		this.destinations.set(toDestinations(this.chess));
	}

	private checkGameOver() {
		if (this.chess.isGameOver()) {
			let winner: Color | 'draw' = 'draw';
			if (this.chess.isCheckmate()) {
				winner = this.chess.turn() === 'w' ? 'black' : 'white';
			}
			this.gameOver.set({ isOver: true, winner });
		}
	}
}
