import type { GameOver } from './types';

/** Human-readable labels for each game-over reason. */
export const REASON_LABELS: Record<string, string> = {
	checkmate: 'Checkmate',
	stalemate: 'Stalemate',
	threefold: 'Draw by repetition',
	insufficient: 'Draw — insufficient material',
	fiftyMove: 'Draw — fifty-move rule',
	draw: 'Draw',
	timeout: 'Timeout',
	resignation: 'Resignation'
};

/**
 * Build the "Game Over: …" banner text for a finished game. Pure — given a
 * {@link GameOver} it returns the exact string the board overlays. Returns ''
 * while the game is still in progress.
 */
export function formatResult(gameOver: GameOver): string {
	if (!gameOver.isOver) return '';
	const reason = gameOver.reason ? (REASON_LABELS[gameOver.reason] ?? '') : '';
	if (gameOver.winner === 'draw') {
		return reason && gameOver.reason !== 'draw' ? `Game Over: ${reason}` : 'Game Over: Draw';
	}
	const winner = gameOver.winner === 'white' ? 'White' : 'Black';
	return reason
		? `Game Over: ${winner} wins by ${reason.toLowerCase()}`
		: `Game Over: ${winner} wins!`;
}
