import dotenv from 'dotenv';
dotenv.config();

import http from 'http';

import app from './app';
import WebSocket from 'ws';
import { handleWebSocketConnection, startHeartbeat } from './lib/websocket';
import { assertValidEnv } from './lib/env';
import { startRoomSweep } from './lib/game';

// Fail fast on invalid configuration before binding any sockets (audit M4).
try {
	assertValidEnv();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

const server = http.createServer(app);

// Periodically reap abandoned rooms so memory stays bounded (audit H4). Started
// here (not at import time) and unref()ed so unit tests never spawn this timer.
startRoomSweep();

// Create a WebSocket server attached to the HTTP server
// maxPayload: the largest legitimate frame is a ~100-byte move/join; anything
// bigger is abuse and is refused by `ws` itself (close 1009) before parsing.
const wss = new WebSocket.Server({ server, maxPayload: 4096 });

// Handle WebSocket connections
wss.on('connection', handleWebSocketConnection);

// Ping every client periodically and terminate the ones that stop answering, so
// dead connections are noticed and the opponent is told (audit SM-1.1).
startHeartbeat(wss);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});

// Defense-in-depth: never let an uncaught error or rejection crash the process.
process.on('uncaughtException', (error) => {
	console.error('Uncaught exception (keeping process alive):', error);
});

process.on('unhandledRejection', (reason) => {
	console.error('Unhandled promise rejection (keeping process alive):', reason);
});

// Graceful shutdown: close WebSocket and HTTP servers cleanly, then exit.
function shutdown(signal: string) {
	console.log(`Received ${signal}, shutting down gracefully...`);

	wss.close(() => {
		console.log('WebSocket server closed');
	});

	server.close(() => {
		console.log('HTTP server closed');
		process.exit(0);
	});

	// Best-effort: force exit if close hangs.
	setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
