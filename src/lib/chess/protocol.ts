/**
 * Stalemates realtime protocol — the single definition of every WebSocket frame.
 *
 * THIS FILE IS SHARED VERBATIM between the server (api/src/lib/protocol.ts) and
 * the client (src/lib/chess/protocol.ts). Edit one, then run
 * `node scripts/sync-protocol.mjs` from the repo root; CI fails if the copies
 * differ (`node scripts/sync-protocol.mjs --check`). Keep it dependency-free
 * and types-only so it compiles in both builds.
 */

export type Color = 'white' | 'black';

export type GameOverReason =
	| 'checkmate'
	| 'stalemate'
	| 'threefold'
	| 'insufficient'
	| 'fiftyMove'
	| 'draw'
	| 'agreement'
	| 'timeout'
	| 'timeoutVsInsufficient'
	| 'resignation'
	| 'abandonment';

export type TimeControl = {
	initial: number; // seconds
	lowTimeThreshold: number; // seconds
	increment: number; // seconds
	isUnlimited: boolean;
};

/** Authoritative clock snapshot; the client interpolates it for display only. */
export type ClockSnapshot = {
	whiteMs: number;
	blackMs: number;
	running: Color | null; // whose clock is ticking (null = paused / unlimited / over)
	serverTime: number; // server Date.now() when the snapshot was taken
};

/** A move on the wire. `promotion` is one of q/r/b/n when present. */
export type WireMove = { from: string; to: string; promotion?: string };

export type GameResult = { winner: Color | 'draw'; reason: GameOverReason };

/** Messages the client sends (client → server). */
export type ClientMessage =
	/** Must be the first frame on every connection: claims (or re-claims) a seat. */
	| { type: 'join'; token: string }
	| { type: 'move'; move: WireMove }
	| { type: 'offerRematch' }
	| { type: 'acceptRematch' }
	| { type: 'resign' }
	| { type: 'claimVictory' }
	| { type: 'offerDraw' }
	| { type: 'acceptDraw' }
	| { type: 'declineDraw' };

/** Full per-player resync payload. */
export type GameStateMessage = {
	type: 'gameState';
	started: boolean;
	fen: string;
	turn: Color;
	/** Every move so far in UCI ("e2e4", "e7e8q"); replayed so history survives a resync. */
	moves: string[];
	clock: ClockSnapshot;
	timeControl: TimeControl;
	gameOver: GameResult | null;
	rematch: { mine: boolean; opponent: boolean };
	/** Pending draw offer: who made it, or null. */
	drawOffer: 'mine' | 'opponent' | null;
	opponentConnected: boolean;
	/** Ms until a win by abandonment may be claimed; null while the opponent is connected. */
	opponentGraceMs: number | null;
};

/** Messages the server sends (server → client). */
export type ServerMessage =
	/** Answer to `join`: your seat, and the (rotated) token to reconnect with. */
	| { type: 'seat'; color: Color; token: string }
	| { type: 'opponentJoined' }
	| { type: 'opponentReconnected' }
	| { type: 'opponentDisconnected'; graceMs: number }
	| { type: 'opponentMove'; move: WireMove }
	| {
			type: 'gameStart';
			fen: string;
			turn: Color;
			timeControl: TimeControl;
			clock: ClockSnapshot;
			/** False when the opponent's seat is taken but they are disconnected (e.g. the creator left before you joined). */
			opponentConnected: boolean;
			/** Ms until a win by abandonment may be claimed; null while the opponent is connected. */
			opponentGraceMs: number | null;
	  }
	| { type: 'clock'; clock: ClockSnapshot }
	| { type: 'gameOver'; winner: Color | 'draw'; reason: GameOverReason; clock: ClockSnapshot }
	| GameStateMessage
	| { type: 'rematchOffer' }
	| {
			type: 'rematchAccepted';
			fen: string;
			turn: Color;
			timeControl: TimeControl;
			clock: ClockSnapshot;
			/** Your colour for the new game — seats swap colours on every rematch. */
			color: Color;
	  }
	/** The opponent offers a draw. */
	| { type: 'drawOffer' }
	/** Your draw offer was declined (explicitly, or by the opponent moving instead). */
	| { type: 'drawDeclined' };

/** Discriminant strings for the server → client messages. */
export type ServerMessageType = ServerMessage['type'];

/** Narrow a `ServerMessage` to the variant for a given `type`. */
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;

/** REST: `POST /game/create` request and response. */
export type CreateGameRequest = { time: 0 | 1 | 3 | 10; color?: Color | 'random' };
export type CreateGameResponse = {
	id: string;
	/** The creator's seat. */
	you: { color: Color; token: string };
	/** The seat to share with the opponent. */
	invite: { color: Color; token: string };
};
