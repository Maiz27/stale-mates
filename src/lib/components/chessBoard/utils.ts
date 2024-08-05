import { Chess, SQUARES, type Color as ChessJsColor, type Square } from 'chess.js';
import type { Chessground } from 'svelte-chessground';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import { Stockfish } from '$lib/engine';
import type { Color } from 'chessground/types';

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
	gameStarted: boolean,
	fen: string,
	playerColor: Color,
	gameMode: 'pve' | 'pvp',
	handleMove: (orig: string, dest: string) => void
): Config {
	const chess = new Chess(fen);
	const turn = chess.turn();
	const isPlayerTurn = isGamePlayable(gameStarted, gameMode, playerColor, turn);

	return {
		fen,
		turnColor: turn === 'w' ? 'white' : 'black',
		movable: {
			color: isPlayerTurn ? playerColor : undefined,
			dests: isPlayerTurn ? toDestinations(chess) : new Map(),
			free: false,
			showDests: true
		},
		draggable: {
			enabled: isPlayerTurn
		},
		events: {
			move: handleMove
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

export function isGamePlayable(
	gameStarted: boolean,
	gameMode: 'pve' | 'pvp',
	playerColor: Color,
	currentTurn: ChessJsColor
): boolean {
	if (!gameStarted) return false;
	if (gameMode === 'pvp') return true;
	return currentTurn === getChessJsColor(playerColor);
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

export function updateBoardState(
	chess: Chess,
	engine: Stockfish,
	chessground: Chessground,
	newFen: string
) {
	chess.load(newFen);
	engine.setPosition(newFen);

	const checkState = getCheckState(chess);
	const shapes: DrawShape[] = [];

	if (checkState.inCheck && checkState.kingSquare && checkState.attackingSquares) {
		shapes.push({ orig: checkState.kingSquare, brush: 'red' });
		checkState.attackingSquares.forEach((square) => {
			shapes.push({ orig: square, brush: 'red' });
		});
	}

	chessground.setAutoShapes(shapes);
	return newFen;
}
