import type { Color } from 'chessground/types';
import type { ChessMove, ClockSnapshot, GameOverReason, TimeControl } from './types';

/**
 * The realtime game protocol, from the client's side. These mirror the messages
 * the server (`api/src/lib/`) produces and consumes; keeping them here lets the
 * client type its WebSocket traffic instead of passing `any` around. (A single
 * copied `protocol.ts` shared verbatim with the server is the remaining step —
 * see ARCHITECTURE.md #6.)
 */

/** Messages the server pushes to the client (server → client). */
export type ServerMessage =
	| { type: 'connected'; playerId: string }
	| { type: 'opponentJoined' }
	| { type: 'opponentReconnected' }
	| { type: 'opponentMove'; move: ChessMove }
	| { type: 'gameStart'; fen: string; turn: Color; timeControl: TimeControl; clock?: ClockSnapshot }
	| { type: 'clock'; clock: ClockSnapshot }
	| {
			type: 'gameOver';
			winner?: Color | 'draw' | null;
			reason?: GameOverReason;
			clock?: ClockSnapshot;
	  }
	| {
			type: 'gameState';
			started: boolean;
			fen: string;
			turn: Color;
			clock?: ClockSnapshot;
			timeControl?: TimeControl;
	  }
	| { type: 'rematchOffer' }
	| {
			type: 'rematchAccepted';
			fen: string;
			turn: Color;
			timeControl: TimeControl;
			clock?: ClockSnapshot;
	  };

/** Discriminant strings for the server → client messages. */
export type ServerMessageType = ServerMessage['type'];

/** Narrow a `ServerMessage` to the variant for a given `type`. */
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;

/**
 * Messages the client sends to the server (client → server). Mirrors the
 * server's inbound `GameMessage` (`api/src/lib/types.ts`) minus the `playerId`,
 * which the server derives from the connection rather than trusting the frame.
 */
export type ClientMessage =
	| { type: 'move'; move: { from: string; to: string; promotion?: string } }
	| { type: 'offerRematch' }
	| { type: 'acceptRematch' }
	| { type: 'resign' };
