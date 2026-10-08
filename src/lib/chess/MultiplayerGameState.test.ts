import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { MultiplayerGameState, canOfferDraw, type GameSocket } from './MultiplayerGameState';
import type { ClientMessage, GameStateMessage, ServerMessage } from './protocol';
import type { ConnectionStatus, Rejection } from '../websocket/WebSocketManager';
import { getSeatToken, setSeatToken, wasRoomEnded } from './seat';

class AudioStub {
	volume = 0;
	src = '';
	load() {}
	pause() {}
	play() {
		return Promise.resolve();
	}
}

beforeAll(() => {
	vi.stubGlobal('Audio', AudioStub);
});

/** In-memory stand-in for the WebSocketManager: records sends, lets tests push server frames. */
class FakeSocket implements GameSocket {
	sent: ClientMessage[] = [];
	open = true;
	private handlers = new Map<string, (data: ServerMessage) => void>();
	private status: ((s: ConnectionStatus, r: Rejection | null) => void) | null = null;

	addMessageHandler(type: string, handler: (data: never) => void) {
		this.handlers.set(type, handler as (data: ServerMessage) => void);
	}
	sendMessage(message: ClientMessage) {
		if (!this.open) return false;
		this.sent.push(message);
		return true;
	}
	onStatus(handler: (s: ConnectionStatus, r: Rejection | null) => void) {
		this.status = handler;
		handler('connecting', null);
	}
	close() {}
	emit(message: ServerMessage) {
		this.handlers.get(message.type)?.(message);
	}
	setStatus(s: ConnectionStatus, r: Rejection | null = null) {
		this.status?.(s, r);
	}
}

const unlimited = { initial: 0, lowTimeThreshold: 0, increment: 0, isUnlimited: true };

function setup(token: string | null = 'seat-token-123') {
	const socket = new FakeSocket();
	let hello: () => ClientMessage | null = () => null;
	const game = new MultiplayerGameState({
		roomId: 'room1',
		token,
		connect: (_url, h) => {
			hello = h;
			return socket as unknown as GameSocket;
		}
	});
	return { game, socket, hello: () => hello() };
}

const NO_CLOCK = { whiteMs: 0, blackMs: 0, running: null, serverTime: 0 };

/** A complete gameState frame with sensible defaults. */
function state(partial: Partial<GameStateMessage>): GameStateMessage {
	return {
		type: 'gameState',
		started: true,
		fen: START,
		turn: 'white',
		moves: [],
		clock: NO_CLOCK,
		timeControl: unlimited,
		gameOver: null,
		rematch: { mine: false, opponent: false },
		drawOffer: null,
		opponentConnected: true,
		opponentGraceMs: null,
		...partial
	};
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

afterEach(() => {
	vi.useRealTimers();
});

describe('MultiplayerGameState resync (SM-1.5)', () => {
	it('keeps the SAN move list across a gameState resync', () => {
		const { game, socket } = setup();
		socket.emit(
			state({
				started: true,
				fen: AFTER_E4_E5,
				turn: 'white',
				moves: ['e2e4', 'e7e5'],
				timeControl: unlimited
			})
		);
		const view = get(game);
		expect(view.sanHistory).toEqual(['e4', 'e5']);
		expect(view.moveHistory.map((m) => `${m.from}${m.to}`)).toEqual(['e2e4', 'e7e5']);
		expect(view.fen).toBe(AFTER_E4_E5);
	});

	it('drops a rejected optimistic move when the server resyncs', () => {
		const { game, socket } = setup();
		socket.emit({
			type: 'gameStart',
			fen: START,
			turn: 'white',
			timeControl: unlimited,
			clock: NO_CLOCK,
			opponentConnected: true,
			opponentGraceMs: null
		});
		game.makeMove({ from: 'e2', to: 'e4' });
		expect(get(game).moveHistory).toHaveLength(1);

		// Server rejected it (e.g. flagged): resync to the start position.
		socket.emit(
			state({
				started: true,
				fen: START,
				turn: 'white',
				moves: [],
				timeControl: unlimited
			})
		);
		expect(get(game).moveHistory).toEqual([]);
		expect(get(game).sanHistory).toEqual([]);
	});

	it('takes back a move the server refused because our flag had fallen (CR2-4)', () => {
		const { game, socket } = setup();
		const clock3 = { initial: 180, lowTimeThreshold: 30, increment: 4, isUnlimited: false };
		const flagged = { whiteMs: 0, blackMs: 120_000, running: null, serverTime: 0 };
		socket.emit({
			type: 'gameStart',
			fen: START,
			turn: 'white',
			timeControl: clock3,
			clock: { ...flagged, whiteMs: 1, running: 'white' },
			opponentConnected: true,
			opponentGraceMs: null
		});
		game.makeMove({ from: 'e2', to: 'e4' });
		expect(get(game).sanHistory).toEqual(['e4']);

		// What the server sends the late mover: the result, then the authoritative state.
		socket.emit({ type: 'gameOver', winner: 'black', reason: 'timeout', clock: flagged });
		socket.emit(
			state({
				started: false,
				fen: START,
				moves: [],
				clock: flagged,
				timeControl: clock3,
				gameOver: { winner: 'black', reason: 'timeout' }
			})
		);
		const view = get(game);
		expect(view.sanHistory).toEqual([]);
		expect(view.fen).toBe(START);
		expect(view.gameOver).toMatchObject({ isOver: true, winner: 'black', reason: 'timeout' });
		game.destroy();
	});

	it('falls back to the FEN when the move list does not reproduce it', () => {
		const { game, socket } = setup();
		socket.emit(
			state({
				started: true,
				fen: AFTER_E4_E5,
				turn: 'white',
				moves: ['e2e5'],
				timeControl: unlimited
			})
		);
		expect(get(game).fen).toBe(AFTER_E4_E5);
	});
});

describe('MultiplayerGameState finished-game reconnect (SM-1.3)', () => {
	it('shows the result and rematch state from the resync payload', () => {
		const { game, socket } = setup();
		socket.emit(
			state({
				started: false,
				fen: START,
				turn: 'white',
				moves: [],
				timeControl: unlimited,
				gameOver: { winner: 'black', reason: 'resignation' },
				rematch: { mine: true, opponent: false },
				opponentConnected: true,
				opponentGraceMs: null
			})
		);
		const view = get(game);
		expect(view.gameOver).toEqual({ isOver: true, winner: 'black', reason: 'resignation' });
		expect(view.myRematchOffer).toBe(true);
		expect(view.rematchOffer).toBe(false);
	});
});

describe('MultiplayerGameState opponent presence (SM-1.6)', () => {
	it('does not assume the opponent is connected on resync', () => {
		const { game, socket } = setup();
		vi.useFakeTimers();
		vi.setSystemTime(10_000);
		socket.emit(
			state({
				started: true,
				fen: START,
				turn: 'white',
				moves: [],
				timeControl: unlimited,
				opponentConnected: false,
				opponentGraceMs: 5_000
			})
		);
		expect(get(game).opponentConnected).toBe(false);
		expect(get(game).opponentClaimableAt).toBe(15_000);
	});

	it('tracks disconnect / reconnect messages', () => {
		const { game, socket } = setup();
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		socket.emit({
			type: 'gameStart',
			fen: START,
			turn: 'white',
			timeControl: unlimited,
			clock: NO_CLOCK,
			opponentConnected: true,
			opponentGraceMs: null
		});
		socket.emit({ type: 'opponentDisconnected', graceMs: 60_000 });
		expect(get(game).opponentConnected).toBe(false);
		expect(get(game).opponentClaimableAt).toBe(61_000);

		socket.emit({ type: 'opponentReconnected' });
		expect(get(game).opponentConnected).toBe(true);
		expect(get(game).opponentClaimableAt).toBeNull();
	});

	it('respects an absent opponent on gameStart (CR-3)', () => {
		const { game, socket } = setup();
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		socket.emit({
			type: 'gameStart',
			fen: START,
			turn: 'white',
			timeControl: unlimited,
			clock: NO_CLOCK,
			opponentConnected: false,
			opponentGraceMs: 40_000
		});
		expect(get(game).started).toBe(true);
		expect(get(game).opponentConnected).toBe(false);
		expect(get(game).opponentClaimableAt).toBe(41_000);
	});

	it('sends a claimVictory frame', () => {
		const { game, socket } = setup();
		game.claimVictory();
		expect(socket.sent).toContainEqual({ type: 'claimVictory' });
	});
});

describe('MultiplayerGameState clock view', () => {
	it('exposes the server low-time threshold (SM-2.10)', () => {
		const { game, socket } = setup();
		vi.useFakeTimers();
		socket.emit({
			type: 'gameStart',
			fen: START,
			turn: 'white',
			timeControl: { initial: 180, lowTimeThreshold: 30, increment: 4, isUnlimited: false },
			clock: { whiteMs: 180_000, blackMs: 180_000, running: 'white', serverTime: Date.now() },
			opponentConnected: true,
			opponentGraceMs: null
		});
		expect(get(game).clock.lowTimeThreshold).toBe(30);
		game.destroy();
	});
});

describe('MultiplayerGameState connection status (SM-1.7)', () => {
	it('mirrors terminal socket statuses into the view', () => {
		const { game, socket } = setup();
		socket.setStatus('rejected', 'notFound');
		expect(get(game).connectionStatus).toBe('rejected');
		expect(get(game).rejection).toBe('notFound');
	});

	it('forgets the stored seat when the server says the room is gone (CR-5)', () => {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			get length() {
				return store.size;
			},
			key: (i: number) => [...store.keys()][i] ?? null,
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k)
		});
		try {
			setSeatToken('room1', 'seat-token-123');
			const { socket } = setup();
			expect(getSeatToken('room1')).toBe('seat-token-123');
			socket.setStatus('rejected', 'notFound');
			expect(getSeatToken('room1')).toBeNull();
		} finally {
			vi.unstubAllGlobals();
			vi.stubGlobal('Audio', AudioStub);
		}
	});

	it('remembers in this tab that the room ended, until a seat is granted (CR3-7)', () => {
		const memory = () => {
			const store = new Map<string, string>();
			return {
				get length() {
					return store.size;
				},
				key: (i: number) => [...store.keys()][i] ?? null,
				getItem: (k: string) => store.get(k) ?? null,
				setItem: (k: string, v: string) => void store.set(k, v),
				removeItem: (k: string) => void store.delete(k)
			};
		};
		vi.stubGlobal('localStorage', memory());
		vi.stubGlobal('sessionStorage', memory());
		try {
			setSeatToken('room1', 'seat-token-123');
			// Other refusals don't mean the room is gone.
			const other = setup();
			other.socket.setStatus('rejected', 'rateLimited');
			expect(wasRoomEnded('room1')).toBe(false);
			const { socket } = setup();
			socket.setStatus('rejected', 'notFound');
			// A reload now finds no seat, but knows why.
			expect(getSeatToken('room1')).toBeNull();
			expect(wasRoomEnded('room1')).toBe(true);
			expect(wasRoomEnded('room2')).toBe(false);
			// A later successful join (e.g. a fresh invite link) clears the marker.
			const again = setup();
			again.socket.emit({ type: 'seat', color: 'white', token: 'rotated-token-456' });
			expect(wasRoomEnded('room1')).toBe(false);
		} finally {
			vi.unstubAllGlobals();
			vi.stubGlobal('Audio', AudioStub);
		}
	});

	it('keeps the rejection kind so the page can explain it (CR-12)', () => {
		const { game, socket } = setup();
		socket.setStatus('rejected', 'rateLimited');
		expect(get(game).rejection).toBe('rateLimited');
	});
	it('connects to the configured game server, never "undefined/…" (CR2-2)', () => {
		const urls: string[] = [];
		new MultiplayerGameState({
			roomId: 'room 1',
			token: 'seat-token-123',
			serverUrl: 'wss://api.example.com',
			connect: (url) => {
				urls.push(url);
				return new FakeSocket() as unknown as GameSocket;
			}
		});
		// Default (this build's URL; vitest runs in dev, so the local API fallback).
		new MultiplayerGameState({
			roomId: 'room1',
			token: 'seat-token-123',
			connect: (url) => {
				urls.push(url);
				return new FakeSocket() as unknown as GameSocket;
			}
		});
		expect(urls).toEqual([
			'wss://api.example.com/game/join?id=room%201',
			'ws://localhost:3000/game/join?id=room1'
		]);
	});

	it('reports a missing server URL instead of connecting to "undefined" (CR2-2)', () => {
		const connect = vi.fn();
		const game = new MultiplayerGameState({
			roomId: 'room1',
			token: 'seat-token-123',
			serverUrl: null,
			connect
		});
		expect(connect).not.toHaveBeenCalled();
		expect(get(game).connectionStatus).toBe('rejected');
		expect(get(game).rejection).toBe('unconfigured');
		game.destroy();
	});
});

describe('MultiplayerGameState seats (SM-3)', () => {
	it('sends the seat token as the first frame, never in the URL', () => {
		let seenUrl = '';
		const socket = new FakeSocket();
		let hello: () => ClientMessage | null = () => null;
		new MultiplayerGameState({
			roomId: 'room1',
			token: 'seat-token-123',
			connect: (url, h) => {
				seenUrl = url;
				hello = h;
				return socket as unknown as GameSocket;
			}
		});
		expect(seenUrl).toMatch(/\/game\/join\?id=room1$/);
		expect(hello()).toEqual({ type: 'join', token: 'seat-token-123' });
	});

	it('adopts the server-assigned colour and the rotated token', () => {
		const { game, socket, hello } = setup();
		socket.emit({ type: 'seat', color: 'black', token: 'rotated-token-456' });
		expect(get(game).player).toBe('black');
		expect(game.player).toBe('black');
		expect(hello()).toEqual({ type: 'join', token: 'rotated-token-456' });
	});
});

describe('MultiplayerGameState draws & rematch (SM-6)', () => {
	const start = (socket: FakeSocket) =>
		socket.emit({
			type: 'gameStart',
			fen: START,
			turn: 'white',
			timeControl: unlimited,
			clock: NO_CLOCK,
			opponentConnected: true,
			opponentGraceMs: null
		});

	it('offers a draw once and shows an incoming offer', () => {
		const { game, socket } = setup();
		start(socket);
		game.offerDraw();
		game.offerDraw();
		expect(socket.sent.filter((m) => m.type === 'offerDraw')).toHaveLength(1);
		expect(get(game).drawOffer).toBe('mine');
		socket.emit({ type: 'drawDeclined' });
		expect(get(game).drawOffer).toBeNull();

		socket.emit({ type: 'drawOffer' });
		expect(get(game).drawOffer).toBe('opponent');
		game.acceptDraw();
		expect(socket.sent).toContainEqual({ type: 'acceptDraw' });
	});

	it('cannot re-offer at the same ply after a decline, until a move is made (CR-4)', () => {
		const { game, socket } = setup();
		socket.emit({ type: 'seat', color: 'white', token: 'seat-token-123' });
		start(socket);
		game.offerDraw();
		socket.emit({ type: 'drawDeclined' });
		expect(get(game).drawOffer).toBeNull();
		expect(canOfferDraw(get(game))).toBe(false);

		game.offerDraw();
		expect(socket.sent.filter((m) => m.type === 'offerDraw')).toHaveLength(1);
		expect(get(game).drawOffer).toBeNull();

		game.makeMove({ from: 'e2', to: 'e4' });
		expect(canOfferDraw(get(game))).toBe(true);
		game.offerDraw();
		expect(socket.sent.filter((m) => m.type === 'offerDraw')).toHaveLength(2);
		expect(get(game).drawOffer).toBe('mine');
	});

	it('a server refusal of a re-offer clears "Draw offered" (CR-4)', () => {
		const { game, socket } = setup();
		start(socket);
		game.offerDraw();
		expect(get(game).drawOffer).toBe('mine');
		socket.emit({ type: 'drawDeclined' });
		expect(get(game).drawOffer).toBeNull();
	});

	it('declining clears the incoming offer', () => {
		const { game, socket } = setup();
		start(socket);
		socket.emit({ type: 'drawOffer' });
		game.declineDraw();
		expect(socket.sent).toContainEqual({ type: 'declineDraw' });
		expect(get(game).drawOffer).toBeNull();
	});

	it('takes the swapped colour on a rematch', () => {
		const { game, socket } = setup();
		socket.emit({ type: 'seat', color: 'white', token: 'seat-token-123' });
		socket.emit({
			type: 'rematchAccepted',
			fen: START,
			turn: 'white',
			timeControl: unlimited,
			clock: NO_CLOCK,
			color: 'black',
			opponentConnected: true,
			opponentGraceMs: null
		});
		expect(get(game).player).toBe('black');
		expect(get(game).started).toBe(true);
	});

	it('restarts the abandonment countdown when a rematch starts with the opponent away (CR2-3)', () => {
		const { game, socket } = setup();
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		// The opponent offered a rematch and left; the old countdown is long past.
		socket.emit({ type: 'opponentDisconnected', graceMs: 60_000 });
		vi.setSystemTime(500_000);
		socket.emit({
			type: 'rematchAccepted',
			fen: START,
			turn: 'white',
			timeControl: unlimited,
			clock: NO_CLOCK,
			color: 'black',
			opponentConnected: false,
			opponentGraceMs: 60_000
		});
		expect(get(game).opponentConnected).toBe(false);
		expect(get(game).opponentClaimableAt).toBe(560_000);
		vi.useRealTimers();
	});
});
