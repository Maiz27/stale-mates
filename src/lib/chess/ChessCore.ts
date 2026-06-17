import { Chess, type Move, type Square } from 'chess.js';
import { getCheckState, toDestinations } from './utils';
import { STARTING_FEN } from '../constants';
import type { CheckState, ChessMove, GameOver, GameOverReason, MoveType } from './types';
import type { Color } from 'chessground/types';

/**
 * Pure chess rules — a thin wrapper over chess.js. No Svelte stores, no audio,
 * no sockets, no engine. This is the shared "core" the game modes compose over,
 * and it's trivially unit-testable (see ChessCore.test.ts).
 */
export class ChessCore {
	private chess: Chess;

	constructor(fen: string = STARTING_FEN) {
		this.chess = new Chess(fen);
	}

	load(fen: string): void {
		this.chess.load(fen);
	}

	reset(): void {
		this.chess.reset();
	}

	fen(): string {
		return this.chess.fen();
	}

	turn(): Color {
		return this.chess.turn() === 'w' ? 'white' : 'black';
	}

	history(): string[] {
		return this.chess.history();
	}

	destinations(): Map<Square, Square[]> {
		return toDestinations(this.chess);
	}

	checkState(): CheckState {
		return getCheckState(this.chess);
	}

	isGameOver(): boolean {
		return this.chess.isGameOver();
	}

	/** Apply a move; returns the Move on success or null. Never throws. */
	move({ from, to, promotion }: ChessMove): Move | null {
		try {
			return this.chess.move({ from, to, promotion }) ?? null;
		} catch {
			return null;
		}
	}

	undo(): void {
		this.chess.undo();
	}

	/** Whether moving from->to is a pawn promotion (probes with a queen, then undoes). */
	isPromotion(from: string, to: string): boolean {
		const move = this.move({ from, to, promotion: 'q' });
		if (move) {
			this.chess.undo();
			return move.flags.includes('p');
		}
		return false;
	}

	/** Classify a just-applied move for the audio cue / UI. */
	moveType(move: Move): MoveType {
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
		return moveType;
	}

	/** Authoritative-by-rules outcome, or null if the game isn't over. */
	outcome(): GameOver | null {
		if (!this.chess.isGameOver()) return null;

		if (this.chess.isCheckmate()) {
			return {
				isOver: true,
				winner: this.chess.turn() === 'w' ? 'black' : 'white',
				reason: 'checkmate'
			};
		}

		let reason: GameOverReason = 'draw';
		if (this.chess.isStalemate()) {
			reason = 'stalemate';
		} else if (this.chess.isThreefoldRepetition()) {
			reason = 'threefold';
		} else if (this.chess.isInsufficientMaterial()) {
			reason = 'insufficient';
		} else {
			// Distinguish the fifty-move rule via the FEN halfmove clock (>= 100 ply).
			const halfmoveClock = Number(this.chess.fen().split(' ')[4]);
			reason = Number.isFinite(halfmoveClock) && halfmoveClock >= 100 ? 'fiftyMove' : 'draw';
		}
		return { isOver: true, winner: 'draw', reason };
	}
}
