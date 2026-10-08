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

/**
 * Whether `color` still has material that could ever deliver mate. Used when a
 * flag falls: losing on time to a side that can't possibly checkmate (a lone
 * king) is a draw, not a loss (FIDE 6.9). Any piece besides the king counts as
 * potential mating material — even K+N vs K+Q has a legal helpmate.
 */
export function hasMatingMaterial(chess: Chess, color: Color): boolean {
	const side = color === 'white' ? 'w' : 'b';
	return chess
		.board()
		.flat()
		.some((sq) => sq !== null && sq.color === side && sq.type !== 'k');
}
