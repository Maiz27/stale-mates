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
	| 'abandonment'
	/**
	 * Ended before both sides had made their first move; no winner. See
	 * `AbortInfo` for why.
	 */
	| 'aborted';

/**
 * Why a game was `aborted`, and the side it's put down to:
 * - `firstMoveTimeout`: timed games — the side to move didn't make its first
 *   move within its first-move window.
 * - `noShow`: the side to move was away (disconnected) past the grace period
 *   before making its first move.
 * - `player`: the side resigned, or offered or accepted a draw, before both
 *   sides had moved, which aborts the game instead.
 */
export type AbortInfo = {
	cause: 'firstMoveTimeout' | 'noShow' | 'player';
	by: Color;
};

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
	running: Color | null; // whose clock is ticking (null = paused / unlimited / over / before the first moves)
	serverTime: number; // server Date.now() when the snapshot was taken
	/**
	 * Timed games only: clocks don't run until each side has made its first move.
	 * Until then this is the ms (at `serverTime`) left before the game is aborted
	 * if the side to move still hasn't made its first move: its first-move window
	 * (which starts once that side is connected, and then keeps running across
	 * reconnects), or, while that side is away and its window hasn't started, the
	 * disconnect grace left. Null once both sides have moved, in untimed games,
	 * and when no game is in progress.
	 */
	firstMoveMs: number | null;
};

/** A move on the wire. `promotion` is one of q/r/b/n when present. */
export type WireMove = { from: string; to: string; promotion?: string };

/** `winner` is null only for an `aborted` game, which also carries `abort`. */
export type GameResult = {
	winner: Color | 'draw' | null;
	reason: GameOverReason;
	abort?: AbortInfo;
};

/** Messages the client sends (client → server). */
export type ClientMessage =
	/** Must be the first frame on every connection: claims (or re-claims) a seat. */
	| { type: 'join'; token: string }
	| { type: 'move'; move: WireMove }
	| { type: 'offerRematch' }
	| { type: 'acceptRematch' }
	/** Before both sides have moved this (like offerDraw / acceptDraw) aborts the game. */
	| { type: 'resign' }
	/** After the grace period; before both sides have moved it aborts the game instead. */
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
	/**
	 * Ms until a win by abandonment may be claimed (or, before both sides have
	 * moved, until the game may be aborted instead); null while the opponent is
	 * connected.
	 */
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
			/**
			 * Ms until a win by abandonment may be claimed; null while the opponent is
			 * connected. An opponent already away when the game starts gets the full
			 * grace from the start, not from when they left.
			 */
			opponentGraceMs: number | null;
	  }
	| { type: 'clock'; clock: ClockSnapshot }
	| {
			type: 'gameOver';
			/** null only when the game was `aborted`. */
			winner: Color | 'draw' | null;
			reason: GameOverReason;
			/** Present only when the game was `aborted`. */
			abort?: AbortInfo;
			clock: ClockSnapshot;
	  }
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
			/** As in `gameStart`: the opponent may have left after offering the rematch. */
			opponentConnected: boolean;
			/**
			 * As in `gameStart`: ms until a win by abandonment may be claimed (the full
			 * grace, counted from the start of the game); null while connected.
			 */
			opponentGraceMs: number | null;
	  }
	/** The opponent offers a draw. */
	| { type: 'drawOffer' }
	/**
	 * Your draw offer was declined (explicitly, or by the opponent moving instead),
	 * or refused because you already offered in this position.
	 */
	| { type: 'drawDeclined' };

/**
 * Close reasons the server sends with a WebSocket close frame. The code is 1008
 * (policy violation) for refusals, 1013 for "Too many connections", 4000 for
 * "Replaced by a newer connection", 1001 for "Server shutting down" and 1011
 * for "Internal server error". Clients use the reason to explain a refusal.
 */
export type CloseReason =
	| 'Origin not allowed'
	| 'Invalid game room'
	| 'Join timeout'
	| 'Expected join'
	| 'Unable to join game'
	| 'Rate limit exceeded'
	| 'Too many connections'
	| 'Replaced by a newer connection'
	| 'Server shutting down'
	| 'Internal server error';

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
