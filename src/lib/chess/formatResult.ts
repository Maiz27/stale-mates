import type { Color } from 'chessground/types';
import type { GameOver, GameOverReason } from './types';

/** Human-readable labels for each game-over reason. */
export const REASON_LABELS: Record<GameOverReason, string> = {
	checkmate: 'Checkmate',
	stalemate: 'Stalemate',
	threefold: 'Draw by repetition',
	insufficient: 'Draw — insufficient material',
	fiftyMove: 'Draw — fifty-move rule',
	draw: 'Draw',
	agreement: 'Draw by agreement',
	timeout: 'Timeout',
	timeoutVsInsufficient: 'Draw — timeout vs insufficient material',
	resignation: 'Resignation',
	abandonment: 'Abandonment',
	aborted: 'Aborted'
};

const sideName = (color: Color) => (color === 'white' ? 'White' : 'Black');

/**
 * Why an aborted game ended (no winner, PGN `*`). With `me` (the local
 * player's colour) it's told from that player's side.
 */
function abortLabel({ abort }: GameOver, me?: Color): string {
	if (!abort) return 'Aborted';
	const mine = me === abort.by;
	const known = me !== undefined;
	switch (abort.cause) {
		case 'firstMoveTimeout':
			return 'Aborted — no first move in time';
		case 'noShow':
			if (!known) return `Aborted — ${sideName(abort.by)} didn't show up`;
			return mine
				? 'Aborted — you were away before your first move'
				: "Opponent didn't show up — game aborted";
		case 'player':
			if (!known) return `Aborted by ${sideName(abort.by)}`;
			return mine ? 'You aborted the game' : 'Your opponent aborted the game';
		default:
			return 'Aborted';
	}
}

/**
 * Build the "Game Over: …" banner text for a finished game. Pure — given a
 * {@link GameOver} it returns the exact string the board overlays. Returns ''
 * while the game is still in progress.
 */
export function formatResult(gameOver: GameOver, me?: Color): string {
	if (!gameOver.isOver) return '';
	if (gameOver.reason === 'aborted') return `Game Over: ${abortLabel(gameOver, me)}`;
	const reason = gameOver.reason ? (REASON_LABELS[gameOver.reason] ?? '') : '';
	if (gameOver.winner === 'draw') {
		return reason && gameOver.reason !== 'draw' ? `Game Over: ${reason}` : 'Game Over: Draw';
	}
	// Defensive: a finished game with no concrete winner (e.g. a malformed/partial
	// state) shouldn't claim a side won — show a neutral banner instead.
	if (gameOver.winner !== 'white' && gameOver.winner !== 'black') {
		return reason ? `Game Over: ${reason}` : 'Game Over';
	}
	const winner = sideName(gameOver.winner);
	return reason
		? `Game Over: ${winner} wins by ${reason.toLowerCase()}`
		: `Game Over: ${winner} wins!`;
}
