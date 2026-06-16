import type { PieceSymbol, Square } from 'chess.js';
import type { Color } from 'chessground/types';

export type GameMode = 'pve' | 'pvp';

export type PromotionMove = { from: string; to: string } | null;

export type GameOverReason =
	| 'checkmate'
	| 'stalemate'
	| 'threefold'
	| 'insufficient'
	| 'fiftyMove'
	| 'draw'
	| 'timeout'
	| 'resignation';

export type GameOver = {
	isOver: boolean;
	winner: Color | 'draw' | null;
	reason?: GameOverReason;
};

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

// Single canonical definition, mirrored on the server at api/src/lib/types.ts.
// All fields required (the optional fields here had drifted from the server).
export type TimeControl = {
	initial: number; // in seconds
	lowTimeThreshold: number; // in seconds
	increment: number; // in seconds
	isUnlimited: boolean;
};

// Authoritative clock snapshot from the server; the client interpolates from it
// for smooth display and never decides game-over from its own timer. Mirrors
// api/src/lib/clock.ts ClockSnapshot.
export type ClockSnapshot = {
	whiteMs: number;
	blackMs: number;
	running: Color | null; // whose clock is ticking (null = paused / unlimited / over)
	serverTime: number; // Date.now() on the server when the snapshot was taken
};
