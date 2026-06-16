import { writable, get, type Readable } from 'svelte/store';
import type { Move } from 'chess.js';
import { ChessCore } from './ChessCore';
import { AudioCue } from './AudioCue';
import { STARTING_FEN } from '../constants';
import type { ChessMove, GameMode, GameView } from './types';
import type { Color } from 'chessground/types';

/** Default clock for single-player / pre-game: no timer running. */
const NO_CLOCK = { isUnlimited: true, myClock: 0, opponentClock: 0 };

/**
 * The shared game core. Composes the pure rules ({@link ChessCore}) and the
 * audio ({@link AudioCue}) and projects everything into a single
 * `Readable<GameView>` that components subscribe to once. The two game modes
 * (`AIGameState`, `MultiplayerGameState`) extend this concrete base and add only
 * their mode-specific behaviour — neither stubs methods it doesn't support, so
 * the old Liskov smell (multiplayer `console.warn`-ing `setDifficulty` &c.) is
 * gone.
 *
 * Subclasses mutate state exclusively through {@link patch} and read it through
 * {@link snapshot}; they never expose individual stores.
 */
export class GameModel implements Readable<GameView> {
	/** Pure rules. Subclasses read/load it (fen/turn/undo) but never touch chess.js directly. */
	protected core: ChessCore;
	private audio: AudioCue;
	readonly mode: GameMode;
	player: Color;

	private store;
	/** Makes the model itself a Svelte store: `$gameState` / `gameState.subscribe`. */
	subscribe;

	constructor(mode: GameMode, player: Color, fen: string = STARTING_FEN) {
		this.core = new ChessCore(fen);
		this.mode = mode;
		this.player = player;
		this.audio = new AudioCue();
		this.store = writable<GameView>({
			fen,
			turn: this.core.turn(),
			started: false,
			checkState: { inCheck: false },
			gameOver: { isOver: false, winner: null },
			destinations: this.core.destinations(),
			promotionMove: null,
			hint: null,
			moveHistory: [],
			sanHistory: [],
			opponentConnected: false,
			connectionStatus: 'connecting',
			rematchOffer: false,
			clock: NO_CLOCK
		});
		this.subscribe = this.store.subscribe;
	}

	/** Current view-model. */
	protected snapshot(): GameView {
		return get(this.store);
	}

	/** Merge a partial view into the store (the only way state changes). */
	protected patch(partial: Partial<GameView>): void {
		this.store.update((view) => ({ ...view, ...partial }));
	}

	/**
	 * Best-effort cleanup so the per-instance HTMLAudioElements can be GC'd.
	 * Subclasses should override and call `super.destroy()` after their own teardown.
	 */
	destroy(): void {
		this.audio.destroy();
	}

	newGame(): void {
		this.core.reset();
		this.updateGameState();
		this.patch({ started: true, moveHistory: [] });
	}

	endGame(): void {
		this.core.reset();
		this.updateGameState();
		this.patch({ started: false, gameOver: { isOver: false, winner: null }, moveHistory: [] });
	}

	handlePlayerMove({ from, to }: ChessMove): void {
		this.clearHint();
		if (this.isPromotionMove(from, to)) {
			this.patch({ promotionMove: { from, to } });
		} else {
			this.makeMove({ from, to });
		}
	}

	makeMove({ from, to, promotion }: ChessMove): boolean {
		const move = this.core.move({ from, to, promotion });
		if (move) {
			this.patch({ moveHistory: [...this.snapshot().moveHistory, { from, to, promotion }] });
			this.updateGameState();
			this.determineMoveType(move);
			return true;
		}
		return false;
	}

	/** Apply the piece chosen in the promotion modal, then dismiss it. */
	completePromotion({ from, to, piece }: { from: string; to: string; piece: string }): boolean {
		const success = this.makeMove({ from, to, promotion: piece });
		if (success) {
			this.clearPromotion();
		}
		return success;
	}

	clearHint(): void {
		this.patch({ hint: null });
	}

	clearPromotion(): void {
		this.patch({ promotionMove: null });
	}

	protected updateGameState(): void {
		this.patch({
			fen: this.core.fen(),
			turn: this.core.turn(),
			sanHistory: this.core.history(),
			destinations: this.core.destinations(),
			checkState: this.core.checkState()
		});
		this.checkGameOver();
	}

	protected checkGameOver(): void {
		const outcome = this.core.outcome();
		if (!outcome) return;
		this.patch({ gameOver: outcome });
	}

	protected isPromotionMove(from: string, to: string): boolean {
		return this.core.isPromotion(from, to);
	}

	protected determineMoveType(move: Move): void {
		this.audio.play(this.core.moveType(move));
	}
}
