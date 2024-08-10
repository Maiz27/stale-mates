import { Chess } from 'chess.js';
import WebSocket from 'ws';
import { nanoid } from 'nanoid';

type Player = {
	id: string;
	color: 'white' | 'black';
	ws: WebSocket;
};

type GameRoom = {
	id: string;
	players: Player[];
	chess: Chess | null;
};

const games = new Map<string, GameRoom>();

async function generateId(): Promise<string> {
	return nanoid();
}

export async function createGame(): Promise<string> {
	const gameId = await generateId();
	games.set(gameId, { id: gameId, players: [], chess: null });
	return gameId;
}

export async function addPlayerToGame(
	gameId: string,
	color: 'white' | 'black',
	ws: WebSocket
): Promise<string | null> {
	const game = games.get(gameId);
	if (!game || game.players.length >= 2) return null;

	const playerId = await generateId();
	const player: Player = { id: playerId, color, ws };
	game.players.push(player);

	if (game.players.length === 2) {
		game.chess = new Chess();
		broadcastGameState(game);
	}

	return playerId;
}

export function removePlayerFromGame(gameId: string, playerId: string) {
	const game = games.get(gameId);
	if (!game) return;

	game.players = game.players.filter((p) => p.id !== playerId);
	if (game.players.length === 0) {
		games.delete(gameId);
	} else {
		broadcastGameState(game);
	}
}

export function checkGameStart(gameId: string): boolean {
	const game = games.get(gameId);
	if (!game || game.players.length !== 2) return false;

	game.chess = new Chess();
	broadcastGameState(game);

	game.players.forEach((player) => {
		player.ws.send(JSON.stringify({ type: 'opponentJoined' }));
		player.ws.send(JSON.stringify({ type: 'gameStart' }));
	});

	return true;
}

export function handlePlayerMessage(gameId: string, playerId: string, message: string) {
	const game = games.get(gameId);
	if (!game) return;

	const data = JSON.parse(message);
	if (data.type === 'move') {
		const move = data.move;
		if (game.chess) {
			const success = game.chess.move(move);
			if (!success) {
				console.log('Invalid move:', move);
			}
			broadcastGameState(game);
		}
	}
}

function broadcastGameState(game: GameRoom) {
	const gameState = {
		type: 'gameState',
		fen: game.chess?.fen() || ''
	};

	const stateJson = JSON.stringify(gameState);

	game.players.forEach((player) => {
		player.ws.send(stateJson);
	});
}
