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
	const params = parseConnectionParams(req);
	if (!params) {
		closeConnection(ws, 1008, 'Invalid game room');
		return;
	}

	console.log(`New connection attempt for game ${params.id}`);
	console.log(`Color: ${params.color}, PlayerId: ${params.playerId}`);

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
	ws.on('close', () => removePlayerFromGame(gameId, playerId));
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
