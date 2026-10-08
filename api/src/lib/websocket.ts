import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import {
	removePlayerFromGame,
	handlePlayerMessage,
	checkGameStart,
	addPlayerToGame,
	reconnectPlayerToGame
} from './game';

interface ConnectionParams {
	id: string;
	color: 'white' | 'black';
	playerId: string | null;
}

export function handleWebSocketConnection(ws: WebSocket, req: IncomingMessage) {
	trackHeartbeat(ws);
	const params = parseConnectionParams(req);
	if (!params) {
		closeConnection(ws, 1008, 'Invalid game room');
		return;
	}

	console.log(`New connection attempt for game ${params.id} (color: ${params.color})`);

	try {
		const activePlayerId = handlePlayerConnection(ws, params);
		if (!activePlayerId) {
			closeConnection(ws, 1008, 'Unable to join game');
			return;
		}

		setupEventListeners(ws, params.id, activePlayerId);
		checkGameStartStatus(params.id);
	} catch (error) {
		console.error('Error handling WebSocket connection:', error);
		closeConnection(ws, 1011, 'Internal server error');
	}
}

function parseConnectionParams(req: IncomingMessage): ConnectionParams | null {
	const url = new URL(req.url!, `http://${req.headers.host}`);
	const id = url.searchParams.get('id');
	const color = url.searchParams.get('color') as 'white' | 'black';
	const playerId = url.searchParams.get('playerId');

	if (!id) {
		return null;
	}

	return { id, color, playerId };
}

function handlePlayerConnection(ws: WebSocket, params: ConnectionParams): string | null {
	if (!params.playerId) {
		console.log('Adding new player to game');
		const activePlayerId = addPlayerToGame(params.id, params.color, ws);
		if (activePlayerId) {
			ws.send(JSON.stringify({ type: 'connected', playerId: activePlayerId }));
		}
		return activePlayerId;
	} else {
		console.log('Reconnecting existing player');
		const reconnected = reconnectPlayerToGame(params.id, params.playerId, ws);
		return reconnected ? params.playerId : null;
	}
}

function setupEventListeners(ws: WebSocket, gameId: string, playerId: string) {
	ws.on('message', (message: string) => handlePlayerMessage(gameId, playerId, message));
	// Pass the socket so a late close from a replaced socket is ignored (audit SM-1.1).
	ws.on('close', () => removePlayerFromGame(gameId, playerId, ws));
}

// Sockets that answered the last heartbeat ping. A socket missing from this set
// when the next ping goes out never ponged: it's a dead TCP path (laptop lid,
// mobile network switch) that would otherwise look "connected" for minutes.
const alive = new WeakSet<WebSocket>();

/** Track liveness for a socket; call once per accepted connection. */
export function trackHeartbeat(ws: WebSocket) {
	alive.add(ws);
	ws.on('pong', () => alive.add(ws));
}

/**
 * One heartbeat round: terminate sockets that missed the previous ping (their
 * `close` then fires and the room marks the player disconnected), and ping the
 * rest. Exported for tests.
 */
export function heartbeatTick(clients: Iterable<WebSocket>) {
	for (const ws of clients) {
		if (!alive.has(ws)) {
			ws.terminate();
			continue;
		}
		alive.delete(ws);
		try {
			ws.ping();
		} catch {
			ws.terminate();
		}
	}
}

/** Start the periodic heartbeat for a server. Returns the (unref'd) timer. */
export function startHeartbeat(
	wss: WebSocket.Server,
	intervalMs = 30_000
): ReturnType<typeof setInterval> {
	const timer = setInterval(() => heartbeatTick(wss.clients), intervalMs);
	timer.unref();
	wss.on('close', () => clearInterval(timer));
	return timer;
}

function checkGameStartStatus(gameId: string) {
	const gameStarted = checkGameStart(gameId);
	if (gameStarted) {
		console.log(`Game ${gameId} started with both players`);
	}
}

function closeConnection(ws: WebSocket, code: number, reason: string) {
	ws.close(code, reason);
}
