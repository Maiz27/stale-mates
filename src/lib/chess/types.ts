import type { PieceSymbol, Square } from 'chess.js';
import type { Color } from 'chessground/types';

export type GameMode = 'pve' | 'pvp';

export type PromotionMove = { from: string; to: string } | null;

export type GameOver = { isOver: boolean; winner: Color | 'draw' | null };

export type CheckState = { inCheck: boolean; kingSquare?: string; attackingSquares?: string[] };

export type ChessMove = {
	from: Square | string;
	to: Square | string;
	promotion?: PieceSymbol | string;
};

export type MoveType =
	| 'normal'
	| 'capture'
	| 'castle'
	| 'check'
	| 'promote'
	| 'game-start'
	| 'game-end';

// duplicate at api/src/lib/types.ts
export type TimeControl = {
	initial: number; // in seconds
	lowTimeThreshold: number;
	increment: number; // in seconds
	isUnlimited: boolean;
};
