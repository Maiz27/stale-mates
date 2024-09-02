import WebSocket from 'ws';

export type Player = {
	id: string;
	color: 'white' | 'black';
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
