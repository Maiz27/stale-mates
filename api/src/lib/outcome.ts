import { Chess } from 'chess.js';
import { Color, GameOverReason } from './types';

/**
 * Authoritative, rules-based game outcome from a chess.js position.
 *
 * Returns `null` if the game is not over. Distinguishes the specific draw
 * reasons (stalemate / threefold / insufficient material / fifty-move &c.)
 * rather than collapsing them all to a generic "draw" — the server is
 * authoritative for multiplayer outcomes, so this is what the client renders.
 */
export function gameOutcome(chess: Chess): { winner?: Color; reason: GameOverReason } | null {
	if (!chess.isGameOver()) return null;

	if (chess.isCheckmate()) {
		// The side to move is checkmated; the other side wins.
		return { winner: chess.turn() === 'w' ? 'black' : 'white', reason: 'checkmate' };
	}
	if (chess.isStalemate()) return { reason: 'stalemate' };
	if (chess.isThreefoldRepetition()) return { reason: 'threefold' };
	if (chess.isInsufficientMaterial()) return { reason: 'insufficient' };

	if (chess.isDrawByFiftyMoves()) return { reason: 'fiftyMove' };
	return { reason: 'draw' };
}

/** Square colour of an algebraic square: true for dark squares (a1 is dark, h1 light). */
export const isDarkSquare = (square: string) =>
	(square.charCodeAt(0) - 'a'.charCodeAt(0) + Number(square[1])) % 2 === 1;

/**
 * Whether `color` could still checkmate by ANY legal sequence of moves, i.e.
 * with the opponent's cooperation (a helpmate). Used when a flag falls: by FIDE
 * 6.9, losing on time to a side that cannot possibly mate is a draw (CR-6).
 *
 * Mate is impossible only when the would-be winner has
 * - a lone king; or
 * - K+N against a lone king; or
 * - K+bishop(s) all on one square colour, against a lone king or a king with
 *   bishops on that same colour only (nothing can ever cover the other colour).
 * Anything else has a helpmate (e.g. K+N vs K+Q: the queen can block its own
 * king's flight square), so it stays a win on time.
 */
export function canStillCheckmate(chess: Chess, color: Color): boolean {
	const side = color === 'white' ? 'w' : 'b';
	const pieces = chess
		.board()
		.flat()
		.filter((sq): sq is NonNullable<typeof sq> => sq !== null && sq.type !== 'k');
	const mine = pieces.filter((p) => p.color === side);
	const theirs = pieces.filter((p) => p.color !== side);

	if (mine.length === 0) return false;
	if (mine.some((p) => p.type === 'p' || p.type === 'r' || p.type === 'q')) return true;

	const knights = mine.filter((p) => p.type === 'n').length;
	if (knights > 0) {
		// A lone knight vs a bare king can't mate; two knights (or N+B) can, helped.
		return !(mine.length === 1 && theirs.length === 0);
	}

	// Only bishops. The opponent's non-bishop material can always be used to block.
	if (theirs.some((p) => p.type !== 'b')) return true;
	const colours = new Set([...mine, ...theirs].map((p) => isDarkSquare(p.square)));
	return colours.size > 1;
}
