import { Chess, SQUARES, type Color as ChessJsColor, type Square } from 'chess.js';
import type { Chessground } from 'svelte-chessground';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import { Stockfish } from '$lib/engine';

export type Color = 'both' | 'white' | 'black' | undefined;

export function initializeChess(fen: string): Chess {
	return new Chess(fen);
}

export function initializeEngine(
	messageHandler: (message: string) => void,
	debug: boolean = true
): Stockfish {
	const engine = new Stockfish(debug);
	engine.onMessage(messageHandler);
	return engine;
}

export function updateConfig(
	fen: string,
	playerColor: Color,
	handleMove: (orig: string, dest: string) => void
): Config {
	return {
		...getConfig(fen, playerColor),
		events: {
			move: handleMove
		}
	};
}

export function getConfig(fen: string, color: Color): Config {
	return {
		fen,
		turnColor: color as 'white' | 'black',
		movable: {
			color,
			free: false,
			dests: toDestinations(new Chess(fen)),
			showDests: true
		},
		draggable: {
			enabled: true,
			showGhost: true
		},
		highlight: {
			lastMove: true,
			check: true
		},
		animation: {
			enabled: true,
			duration: 200
		},
		coordinates: true,
		drawable: {
			enabled: true,
			visible: true,
			defaultSnapToValidMove: true,
			brushes: getBrushes()
		}
	};
}

export function getBrushes() {
	return {
		green: { key: 'green', color: '#15781B', opacity: 1, lineWidth: 10 },
		red: { key: 'red', color: '#882020', opacity: 1, lineWidth: 10 },
		blue: { key: 'blue', color: '#003088', opacity: 1, lineWidth: 10 },
		yellow: { key: 'yellow', color: '#e68f00', opacity: 1, lineWidth: 10 }
	};
}

export function getChessJsColor(color: Color): ChessJsColor {
	return color === 'white' ? 'w' : 'b';
}

export function isWhite(color: Color): boolean {
	return color === 'white' || color === 'both';
}

export function isVsAI(gameMode: 'pve' | 'pvp'): boolean {
	return gameMode === 'pve';
}

export function highlightHint(chessground: Chessground, hint: { from: string; to: string }) {
	const shape = { orig: hint.from, dest: hint.to, brush: 'green' } as DrawShape;
	chessground.setAutoShapes([shape]);
	setTimeout(() => chessground.setAutoShapes([]), 3500);
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
			.filter((move) => move.flags.includes('c') || move.to === kingSquare)
			.map((move) => move.from);

		return { inCheck: true, kingSquare, attackingSquares: attackingSquares[0] };
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
