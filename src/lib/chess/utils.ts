import { Chess, SQUARES, type Color as ChessJsColor, type Square } from 'chess.js';
import type { Color } from 'chessground/types';
import { Stockfish } from '$lib/engine/Stockfish';
import type { GameMode } from './types';

export function initializeEngine(
	messageHandler: (message: string) => void,
	debug: boolean = true
): Stockfish {
	const engine = new Stockfish(debug);
	engine.onMessage(messageHandler);
	return engine;
}

export function isVsAI(gameMode: GameMode): boolean {
	return gameMode === 'pve';
}

export function getChessJsColor(color: Color): ChessJsColor {
	return color === 'white' ? 'w' : 'b';
}

export function isPromotionMove(
	chess: Chess,
	orig: Square | string,
	dest: Square | string
): boolean {
	const piece = chess.get(orig as Square);
	return piece && piece.type === 'p' && (dest.charAt(1) === '8' || dest.charAt(1) === '1');
}

export function getCheckState(chess: Chess) {
	const turn = chess.turn();
	if (chess.inCheck()) {
		const kingSquare = chess
			.board()
			.flat()
			.find((piece) => piece && piece.type === 'k' && piece.color === turn)?.square;

		const attackingSquares = chess
			.moves({ verbose: true })
			.filter((move) => move.flags.includes('c'))
			.map((move) => move.from);

		return { inCheck: true, kingSquare, attackingSquares };
	}
	return { inCheck: false };
}

export function toDestinations(chess: Chess): Map<Square, Square[]> {
	const destinations = new Map<Square, Square[]>();

	SQUARES.forEach((square: Square) => {
		const moves = chess.moves({ square, verbose: true });
		if (moves.length > 0) {
			destinations.set(
				square,
				moves.map((move) => move.to as Square)
			);
		}
	});

	return destinations;
}
