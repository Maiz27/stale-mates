import type { GameOver, GameOverReason } from './types';

/** Human-readable labels for each game-over reason. */
export const REASON_LABELS: Record<GameOverReason, string> = {
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
	// Defensive: a finished game with no concrete winner (e.g. a malformed/partial
	// state) shouldn't claim a side won — show a neutral banner instead.
	if (gameOver.winner !== 'white' && gameOver.winner !== 'black') {
		return reason ? `Game Over: ${reason}` : 'Game Over';
	}
	const winner = gameOver.winner === 'white' ? 'White' : 'Black';
	return reason
		? `Game Over: ${winner} wins by ${reason.toLowerCase()}`
		: `Game Over: ${winner} wins!`;
}
