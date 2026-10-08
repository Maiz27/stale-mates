import type { PieceSymbol, Square } from 'chess.js';
import type { Color } from 'chessground/types';
import type { ConnectionStatus, Rejection } from '../websocket/WebSocketManager';
import type { GameOverReason, TimeControl, ClockSnapshot } from './protocol';

export type GameMode = 'pve' | 'pvp';

export type PromotionMove = { from: string; to: string } | null;

// Wire-level types come from the shared protocol (identical copy on the server).
export type { GameOverReason, TimeControl, ClockSnapshot };

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
	| 'game-end'
	| 'notify'
	| 'low-time';

// Player-relative clock for display. The game modes resolve white/black into
// "mine" vs "the opponent's" so consumers never branch on player color.
export type ClockView = {
	isUnlimited: boolean;
	myClock: number; // seconds
	opponentClock: number; // seconds
	lowTimeThreshold: number; // seconds; the server's per-time-control "low time" level
};

// The single immutable view-model every consumer renders from. Replaces the
// ~18 per-field Svelte stores the game modes used to expose: the modes patch
// this object and expose themselves as a `Readable<GameView>`. Multiplayer-only
// fields carry harmless defaults in single-player mode (the AI page ignores them).
export type GameView = {
	/** The side the local player controls (drives board orientation / input). */
	player: Color;
	fen: string;
	turn: Color;
	started: boolean;
	checkState: CheckState;
	gameOver: GameOver;
	destinations: Map<Square, Square[]>;
	promotionMove: PromotionMove;
	hint: ChessMove | null;
	/** AI mode: a hint search is running. */
	hintPending: boolean;
	/** AI mode: the engine is computing its move. */
	thinking: boolean;
	moveHistory: ChessMove[];
	sanHistory: string[];
	// Multiplayer-only.
	opponentConnected: boolean;
	/** Local `Date.now()` after which a win by abandonment may be claimed; null while the opponent is present. */
	opponentClaimableAt: number | null;
	connectionStatus: ConnectionStatus;
	/** Why the server refused us, when `connectionStatus` is `rejected`. */
	rejection: Rejection | null;
	/** The opponent has offered a rematch. */
	rematchOffer: boolean;
	/** I have offered a rematch (server-confirmed on resync). */
	myRematchOffer: boolean;
	/** Pending draw offer in the current game. */
	drawOffer: 'mine' | 'opponent' | null;
	/** Ply (moves played) at my last draw offer; the server refuses another until it changes. */
	lastDrawOfferPly: number | null;
	clock: ClockView;
};
