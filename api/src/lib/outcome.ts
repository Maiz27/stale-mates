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

	// Fifty-move rule and any remaining draw conditions.
	return { reason: 'draw' };
}
