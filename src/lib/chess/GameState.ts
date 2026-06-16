import { writable, type Writable } from 'svelte/store';
import type { Move, Square } from 'chess.js';
import { ChessCore } from './ChessCore';
import { AudioCue } from './AudioCue';
import type { GameSettings } from '$lib/stores/gameSettings';
import { STARTING_FEN } from '../constants';
import type {
	CheckState,
	ChessMove,
	GameMode,
	GameOver,
	PromotionMove,
	MoveType
} from './types';
import type { Color } from 'chessground/types';

export abstract class GameState {
	/** Pure rules. Subclasses read/load it (fen/turn/undo) but never touch chess.js directly. */
	protected core: ChessCore;
	private audio: AudioCue;
	mode: GameMode;
	player: Color;
	moveHistory: Writable<ChessMove[]> = writable([]);
	sanHistory: Writable<string[]> = writable([]);
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
		this.core = new ChessCore(fen);
		this.mode = mode;
		this.player = player;
		this.fen = writable(fen);
		this.turn = writable(this.core.turn());
		this.updateDestinations();
		this.audio = new AudioCue();
	}

	abstract setDifficulty(difficulty: number): void;
	abstract updateSettings(settings: GameSettings): void;
	abstract undoMove(): void;
	abstract getHint(): Promise<ChessMove | null>;
	abstract resign(): void;

	/**
	 * Best-effort cleanup so the per-instance HTMLAudioElements can be GC'd.
	 * Subclasses should override and call `super.destroy()` after their own teardown.
	 */
	destroy(): void {
		this.audio.destroy();
	}

	newGame() {
		this.core.reset();
		this.updateGameState();
		this.started.set(true);
		this.audioCue.set('game-start');
	}

	endGame() {
		this.core.reset();
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
		const move = this.core.move({ from, to, promotion });
		if (move) {
			this.moveHistory.update((history) => [...history, { from, to, promotion }]);
			this.updateGameState();
			this.determineMoveType(move);
			return true;
		}
		return false;
	}

	clearHint(): void {
		this.hint.set(null);
	}

	protected updateGameState() {
		this.fen.set(this.core.fen());
		this.turn.set(this.core.turn());
		this.sanHistory.set(this.core.history());
		this.updateDestinations();
		this.checkState.set(this.core.checkState());
		this.checkGameOver();
	}

	protected updateDestinations() {
		this.destinations.set(this.core.destinations());
	}

	protected checkGameOver() {
		const outcome = this.core.outcome();
		if (!outcome) return;
		if (outcome.reason === 'checkmate') {
			this.audioCue.set('game-end');
		}
		this.gameOver.set(outcome);
	}

	protected isPromotionMove(from: string, to: string): boolean {
		return this.core.isPromotion(from, to);
	}

	protected determineMoveType(move: Move) {
		const moveType = this.core.moveType(move);
		this.audioCue.set(moveType);
		this.audio.play(moveType);
	}
}
