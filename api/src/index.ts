import dotenv from 'dotenv';
dotenv.config();

import http from 'http';

import app from './app';
import { createWebSocketServer } from './lib/websocket';
import type { CloseReason } from './lib/protocol';
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

// The game WebSocket server: 4 KB frame cap, per-socket error handling, and a
// heartbeat that terminates sockets that stop answering pings, so dead
// connections are noticed and the opponent is told (audit SM-1.1).
const wss = createWebSocketServer(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});

// An uncaught exception means some code path was left half-done, so the
// in-memory rooms can no longer be trusted: log it, try a graceful shutdown and
// exit non-zero so the process manager (Fly's machine restart policy, Docker
// `restart:`) starts a clean process. Expected per-socket failures never get
// here: sockets have 'error' listeners and message handlers catch (CR-2).
process.on('uncaughtException', (error) => {
	console.error('Uncaught exception, exiting:', error);
	shutdown('uncaughtException', 1);
});

// A stray rejected promise doesn't leave synchronous state half-updated; log it
// and keep serving.
process.on('unhandledRejection', (reason) => {
	console.error('Unhandled promise rejection:', reason);
});

// Graceful shutdown: close WebSocket and HTTP servers cleanly, then exit.
let shuttingDown = false;
function shutdown(signal: string, exitCode = 0) {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`Received ${signal}, shutting down gracefully...`);

	// wss.close() doesn't close accepted sockets, and server.close() waits for
	// them; 1001 tells clients to reconnect (to the restarted process).
	const reason: CloseReason = 'Server shutting down';
	for (const client of wss.clients) client.close(1001, reason);
	wss.close(() => {
		console.log('WebSocket server closed');
	});

	server.close(() => {
		console.log('HTTP server closed');
		process.exit(exitCode);
	});

	// Best-effort: force exit if close hangs.
	setTimeout(() => process.exit(exitCode), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
