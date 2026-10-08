import { Chess, type Square } from 'chess.js';
import type { ChessMove } from './types';

export type ParsedMove = { ok: true; move: ChessMove } | { ok: false; error: string };

const UCI = /^([a-h][1-8])[-x]?([a-h][1-8])=?([qrbn])?$/i;

/**
 * Parse a typed move (SAN like "Nf3", "exd5", "O-O", "e8=Q", or coordinates like
 * "e2e4", "e2-e4", "e7e8q") against the position, validated by chess.js.
 * Returns the move's squares, or a human-readable error. A coordinate move to
 * the last rank without a piece is returned without `promotion`, so the caller
 * can ask which piece (same as dragging).
 */
export function parseMoveInput(input: string, fen: string): ParsedMove {
	const text = input.trim();
	if (!text) return { ok: false, error: 'Type a move, e.g. e4, Nf3 or e2e4.' };

	let chess: Chess;
	try {
		chess = new Chess(fen);
	} catch {
		return { ok: false, error: 'The current position is invalid.' };
	}

	const uci = UCI.exec(text);
	if (uci) {
		const from = uci[1].toLowerCase() as Square;
		const to = uci[2].toLowerCase() as Square;
		const promotion = uci[3]?.toLowerCase();
		const candidates = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
		if (candidates.length === 0) return { ok: false, error: `${text} is not a legal move here.` };
		if (candidates[0].promotion) {
			if (promotion && !candidates.some((m) => m.promotion === promotion)) {
				return { ok: false, error: `${text} is not a legal promotion.` };
			}
			return { ok: true, move: promotion ? { from, to, promotion } : { from, to } };
		}
		return { ok: true, move: { from, to } };
	}

	// SAN. Accept zeros for castling and a lowercase piece letter (but not "b",
	// which is ambiguous with the b-file pawn).
	const san = text.replace(/0/g, 'O').replace(/^([nrqk])/, (c) => c.toUpperCase());
	try {
		const move = chess.move(san);
		if (!move) throw new Error('illegal');
		return {
			ok: true,
			move: move.promotion
				? { from: move.from, to: move.to, promotion: move.promotion }
				: { from: move.from, to: move.to }
		};
	} catch {
		return { ok: false, error: `${text} is not a legal move here.` };
	}
}
