import dotenv from 'dotenv';
dotenv.config();

import http from 'http';

import app from './app';
import WebSocket from 'ws';
import { handleWebSocketConnection } from './lib/websocket';

const server = http.createServer(app);

// Create a WebSocket server attached to the HTTP server
const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on('connection', handleWebSocketConnection);

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
