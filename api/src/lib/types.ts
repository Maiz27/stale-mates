import WebSocket from 'ws';
import type { Color } from './protocol';

// Wire types live in the shared protocol module (copied verbatim to the client).
export type {
	Color,
	GameOverReason,
	TimeControl,
	ClockSnapshot,
	GameResult,
	AbortInfo,
	ClientMessage,
	ServerMessage,
	WireMove
} from './protocol';

export type Player = {
	id: string;
	color: Color;
	ws: WebSocket | null;
	connected: boolean;
	/** Server time (ms) the player's socket dropped, or null while connected. */
	disconnectedAt: number | null;
};

export type TimeOption = 0 | 1 | 3 | 10;
