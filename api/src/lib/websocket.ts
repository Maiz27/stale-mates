import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { addPlayerToGame, removePlayerFromGame, handlePlayerMessage, checkGameStart } from './game';

export async function handleWebSocketConnection(ws: WebSocket, req: IncomingMessage) {
	const url = new URL(req.url!, `http://${req.headers.host}`);
	const gameId = url.searchParams.get('room');
	const color = url.searchParams.get('color') as 'white' | 'black';

	if (!gameId) {
		ws.close(1008, 'Invalid game room');
		return;
	}

	try {
		const playerId = await addPlayerToGame(gameId, color, ws);

		if (!playerId) {
			ws.close(1008, 'Unable to join game');
			return;
		}

		ws.on('message', (message: string) => handlePlayerMessage(gameId, playerId, message));

		ws.on('close', () => removePlayerFromGame(gameId, playerId));

		ws.send(JSON.stringify({ type: 'connected', playerId }));

		// Check if the game can start (both players have joined)
		const gameStarted = checkGameStart(gameId);
		if (gameStarted) {
			console.log(`Game ${gameId} started with both players`);
		}
	} catch (error) {
		console.error('Error adding player to game:', error);
		ws.close(1011, 'Internal server error');
	}
}
