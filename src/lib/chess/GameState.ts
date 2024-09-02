import { writable, type Writable } from 'svelte/store';
import { Chess, type Move, type Square } from 'chess.js';
import { getCheckState, toDestinations } from './utils';
import type { GameSettings } from '$lib/stores/gameSettings';
import { STARTING_FEN, MOVE_AUDIOS_PATHS } from '../constants';
import type { CheckState, ChessMove, GameMode, GameOver, PromotionMove, MoveType } from './types';
import type { Color } from 'chessground/types';

export abstract class GameState {
	protected chess: Chess;
	private audioFiles: Record<MoveType, HTMLAudioElement> = {} as Record<MoveType, HTMLAudioElement>;
	mode: GameMode;
	player: Color;
	moveHistory: Writable<ChessMove[]> = writable([]);
	audioCue: Writable<MoveType> = writable('normal');
	started: Writable<boolean> = writable(false);
	promotionMove: Writable<PromotionMove> = writable(null);
	checkState: Writable<CheckState> = writable({ inCheck: false });
	gameOver: Writable<GameOver> = writable({ isOver: false, winner: null });
	fen: Writable<string>;
	turn: Writable<Color>;
	destinations: Writable<Map<Square, Square[]>> = writable(new Map());
	hint: Writable<ChessMove | null> = writable(null);

	constructor(mode: GameMode, player: Color, fen: string = STARTING_FEN) {
		this.chess = new Chess(fen);
		this.mode = mode;
		this.player = player;
		this.fen = writable(fen);
		this.turn = writable(this.chess.turn() === 'w' ? 'white' : 'black');
		this.updateDestinations();

		// Initialize audio files
		Object.entries(MOVE_AUDIOS_PATHS).forEach(([key, path]) => {
			this.audioFiles[key as MoveType] = new Audio(path);
			this.audioFiles[key as MoveType].load();
			this.audioFiles[key as MoveType].volume = 0.9;
		});
	}

	abstract setDifficulty(difficulty: number): void;
	abstract updateSettings(settings: GameSettings): void;
	abstract undoMove(): void;
	abstract getHint(): Promise<ChessMove | null>;

	protected onMove(move: Move): void {
		console.log('Move:', move);
	}
	protected onNewGame(): void {}

	newGame() {
		this.chess.reset();
		this.updateGameState();
		this.started.set(true);
		this.audioCue.set('game-start');
		this.onNewGame();
	}

	endGame() {
		this.chess.reset();
		this.updateGameState();
		this.started.set(false);
		this.gameOver.set({ isOver: false, winner: null });
		this.audioCue.set('game-end');
	}

	handlePlayerMove({ from, to }: ChessMove) {
		if (this.isPromotionMove(from, to)) {
			this.promotionMove.set({ from, to });
		} else {
			this.makeMove({ from, to });
		}
	}

	makeMove({ from, to, promotion }: ChessMove): boolean {
		try {
			const move = this.chess.move({ from, to, promotion });
			if (move) {
				this.moveHistory.update((history) => [...history, { from, to, promotion }]);
				this.updateGameState();
				this.determineMoveType(move);
				this.onMove(move);
				return true;
			}
		} catch (error) {
			console.error('Invalid move:', { from, to, promotion }, error);
		}
		return false;
	}

	clearHint(): void {
		this.hint.set(null);
	}

	protected updateGameState() {
		this.fen.set(this.chess.fen());
		this.turn.set(this.chess.turn() === 'w' ? 'white' : 'black');
		this.updateDestinations();
		this.checkState.set(getCheckState(this.chess));
		this.checkGameOver();
	}

	protected updateDestinations() {
		this.destinations.set(toDestinations(this.chess));
	}

	protected checkGameOver() {
		if (this.chess.isGameOver()) {
			let winner: Color | 'draw' = 'draw';
			if (this.chess.isCheckmate()) {
				this.audioCue.set('game-end');
				winner = this.chess.turn() === 'w' ? 'black' : 'white';
			}
			this.gameOver.set({ isOver: true, winner });
		}
	}

	protected isPromotionMove(from: string, to: string): boolean {
		const move = this.chess.move({ from, to, promotion: 'q' });
		if (move) {
			this.chess.undo();
			return move.flags.includes('p');
		}
		return false;
	}

	protected determineMoveType(move: Move) {
		let moveType: MoveType = 'normal';
		if (move.captured) {
			moveType = 'capture';
		} else if (move.flags.includes('k') || move.flags.includes('q')) {
			moveType = 'castle';
		} else if (move.flags.includes('p')) {
			moveType = 'promote';
		}
		if (this.chess.isCheck()) {
			moveType = 'check';
		}
		this.audioCue.set(moveType);
		this.playMoveAudio(moveType);
	}

	protected async playMoveAudio(moveType: MoveType) {
		if (this.audioFiles[moveType]) {
			try {
				await this.audioFiles[moveType].play();
			} catch (error) {
				console.error('Audio playback failed:', error);
			}
		}
	}
}
