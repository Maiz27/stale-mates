import { writable, type Writable } from 'svelte/store';
import { Chess, type Square } from 'chess.js';
import type { Stockfish } from '$lib/engine/Stockfish_fix_case_error';
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

export class GameState {
	private chess: Chess;
	private engine: Stockfish;
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
		fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		player = 'white' as Color,
		gameMode = 'pve' as GameMode
	}) {
		this.chess = new Chess(fen);
		this.engine = initializeEngine(this.handleEngineMessage.bind(this), debug);
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
		this.started.set(true);
		if (isVsAI(this.mode) && this.player === 'black') {
			this.engine.go();
		}
	}

	endGame() {
		this.started.set(false);
		this.gameOver.set({ isOver: false, winner: null });
		this.chess.reset();
		this.updateGameState();
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

	handlePlayerMove({ from, to }: ChessMove) {
		if (isPromotionMove(this.chess, from, to)) {
			this.promotionMove.set({ from, to });
		} else {
			this.makeMove({ from, to });
		}
	}

	makeMove({ from, to, promotion }: ChessMove) {
		try {
			const move = this.chess.move({ from, to, promotion });
			if (move) {
				this.updateGameState();
				this.engine.setPosition(this.chess.fen());
				if (isVsAI(this.mode) && getChessJsColor(this.player) !== this.chess.turn()) {
					this.engine.go();
				}
				return true;
			}
		} catch (error) {
			console.error('Invalid move:', { from, to, promotion }, error);
		}
		return false;
	}

	private handleEngineMessage(message: string) {
		if (message.includes('bestmove')) {
			const { from, to } = this.engine.getBestMove();
			if (isVsAI(this.mode) && this.chess.turn() !== getChessJsColor(this.player)) {
				this.makeMove({ from, to, promotion: 'q' });
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
