import WebSocket from 'ws';

export type Color = 'white' | 'black';

export type Player = {
	id: string;
	color: Color;
	ws: WebSocket;
	timeRemaining: number | null;
};

export type TimeOption = 0 | 1 | 3 | 10;

// duplicate at api/src/lib/types.ts
export type TimeControl = {
	initial: number; // in seconds
	lowTimeThreshold: number;
	increment: number; // in seconds
	isUnlimited: boolean;
};

export type GameMessage =
	| { type: 'move'; playerId: string; move: { from: string; to: string; promotion?: string } }
	| { type: 'offerRematch'; playerId: string }
	| { type: 'acceptRematch'; playerId: string }
	| { type: 'gameOver'; reason: 'timeout'; winner: Color };
