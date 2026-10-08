import WebSocket from 'ws';

export type Color = 'white' | 'black';

export type Player = {
	id: string;
	color: Color;
	ws: WebSocket | null;
	connected: boolean;
	/** Server time (ms) the player's socket dropped, or null while connected. */
	disconnectedAt: number | null;
};

export type TimeOption = 0 | 1 | 3 | 10;

// Single canonical definition. Mirrored on the client at src/lib/chess/types.ts;
// keep the two in sync (all fields required to avoid the drift the audit found).
export type TimeControl = {
	initial: number; // in seconds
	lowTimeThreshold: number; // in seconds
	increment: number; // in seconds
	isUnlimited: boolean;
};

// Mirror of the client's GameOverReason (src/lib/chess/types.ts) so the server
// can broadcast the specific ending reason it is authoritative for.
export type GameOverReason =
	| 'checkmate'
	| 'stalemate'
	| 'threefold'
	| 'insufficient'
	| 'fiftyMove'
	| 'draw'
	| 'timeout'
	| 'timeoutVsInsufficient'
	| 'resignation'
	| 'abandonment';

/** A finished game's result. `winner` is 'draw' for every drawn ending. */
export type GameResult = { winner: Color | 'draw'; reason: GameOverReason };

// Inbound (client -> server). NOTE: there is deliberately no client 'gameOver'
// / 'timeout' message — outcomes are decided server-side only (audit F1).
export type GameMessage =
	| { type: 'move'; move: { from: string; to: string; promotion?: string } }
	| { type: 'offerRematch' }
	| { type: 'acceptRematch' }
	| { type: 'resign' }
	| { type: 'claimVictory' };
