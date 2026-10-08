import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type WebSocket from 'ws';
import { Chess } from 'chess.js';
import { GameRoom, CLOSE_REPLACED } from './GameRoom';
import type { TimeOption } from './types';

/** A fake socket that records every frame sent to it and close() calls. */
class FakeWs {
	sent: Record<string, unknown>[] = [];
	closed: { code?: number; reason?: string } | null = null;
	send(data: string) {
		this.sent.push(JSON.parse(data));
	}
	close(code?: number, reason?: string) {
		this.closed = { code, reason };
	}
	of(type: string) {
		return this.sent.filter((m) => m.type === type);
	}
	last(type: string) {
		const all = this.of(type);
		return all[all.length - 1];
	}
	clear() {
		this.sent = [];
	}
}
const asWs = (f: FakeWs) => f as unknown as WebSocket;

function setup(time: TimeOption = 0, opts: { graceMs?: number } = {}) {
	let now = 1_000_000;
	const clock = {
		get: () => now,
		advance: (ms: number) => {
			now += ms;
		}
	};
	const room = new GameRoom({ time, disconnectGraceMs: opts.graceMs ?? 60_000, now: clock.get });
	const white = new FakeWs();
	const black = new FakeWs();
	const tokens = room.initialTokens();
	const whiteId = room.claimSeat(tokens.white, asWs(white))!.id;
	const blackId = room.claimSeat(tokens.black, asWs(black))!.id;
	const tokenOf = (ws: FakeWs) => (ws.last('seat') as { token: string }).token;
	// Test helper: reconnect a seat with the rotated token it was given.
	const reconnect = (id: string, ws: FakeWs) => {
		const seatWs = id === whiteId ? white : black;
		return room.claimSeat(tokenOf(seatWs), asWs(ws)) !== null;
	};
	return { room, white, black, whiteId, blackId, clock, reconnect };
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('reconnect race (SM-1.1)', () => {
	it('ignores a late close from the old socket after the seat reconnected', () => {
		const { reconnect, room, white, whiteId } = setup();
		const fresh = new FakeWs();
		expect(reconnect(whiteId, asWs(fresh))).toBe(true);

		// The old socket's close event arrives late.
		room.removePlayer(whiteId, asWs(white));

		const player = room.players.find((p) => p.id === whiteId)!;
		expect(player.connected).toBe(true);
		expect(player.ws).toBe(fresh);
	});

	it('closes the superseded socket when a seat reconnects', () => {
		const { reconnect, white, whiteId } = setup();
		reconnect(whiteId, asWs(new FakeWs()));
		expect(white.closed?.code).toBe(CLOSE_REPLACED);
	});

	it('still disconnects when the current socket closes', () => {
		const { room, white, black, whiteId } = setup();
		room.removePlayer(whiteId, asWs(white));
		expect(room.players.find((p) => p.id === whiteId)!.connected).toBe(false);
		expect(black.last('opponentDisconnected')).toEqual({
			type: 'opponentDisconnected',
			graceMs: 60_000
		});
	});

	it('tells the opponent when the player comes back', () => {
		const { reconnect, room, white, black, whiteId } = setup();
		room.removePlayer(whiteId, asWs(white));
		reconnect(whiteId, asWs(new FakeWs()));
		expect(black.of('opponentReconnected')).toHaveLength(1);
	});
});

describe('resync payload (SM-1.3 / SM-1.5 / SM-1.6)', () => {
	it('carries the move list so the client can rebuild SAN history', () => {
		const { reconnect, room, whiteId, blackId } = setup();
		room.handleMessage(whiteId, { type: 'move', move: { from: 'e2', to: 'e4' } });
		room.handleMessage(blackId, { type: 'move', move: { from: 'e7', to: 'e5' } });

		const fresh = new FakeWs();
		reconnect(whiteId, asWs(fresh));
		const state = fresh.last('gameState') as { moves: string[]; started: boolean };
		expect(state.moves).toEqual(['e2e4', 'e7e5']);
		expect(state.started).toBe(true);
	});

	it('includes the result and rematch state when reconnecting into a finished game', () => {
		const { reconnect, room, whiteId, blackId } = setup();
		room.handleMessage(whiteId, { type: 'resign' });
		room.handleMessage(blackId, { type: 'offerRematch' });

		const fresh = new FakeWs();
		reconnect(whiteId, asWs(fresh));
		const state = fresh.last('gameState') as Record<string, unknown>;
		expect(state.gameOver).toEqual({ winner: 'black', reason: 'resignation' });
		expect(state.rematch).toEqual({ mine: false, opponent: true });
	});

	it('reports opponent presence instead of assuming it', () => {
		const { reconnect, room, white, black, whiteId, blackId } = setup();
		room.removePlayer(blackId, asWs(black));
		room.removePlayer(whiteId, asWs(white));
		const fresh = new FakeWs();
		reconnect(whiteId, asWs(fresh));
		const state = fresh.last('gameState') as Record<string, unknown>;
		expect(state.opponentConnected).toBe(false);
		expect(state.opponentGraceMs).toBe(60_000);
	});

	it('does not broadcast a full gameState to the opponent on disconnect', () => {
		const { room, white, black, whiteId } = setup();
		black.clear();
		room.removePlayer(whiteId, asWs(white));
		expect(black.of('gameState')).toHaveLength(0);
	});
});

describe('flag fall (SM-1.4)', () => {
	it('rejects a move that arrives after the mover flagged and ends the game on time', () => {
		const { room, white, black, whiteId, clock } = setup(1); // 60s + 3s
		clock.advance(61_000); // white never moved; the watchdog hasn't fired yet
		room.handleMessage(whiteId, { type: 'move', move: { from: 'e2', to: 'e4' } });

		expect(white.of('opponentMove')).toHaveLength(0);
		expect(black.of('opponentMove')).toHaveLength(0);
		expect(black.last('gameOver')).toMatchObject({ winner: 'black', reason: 'timeout' });
		expect(room.gameStarted).toBe(false);
	});

	it('scores a timeout against a lone king as a draw', () => {
		const { room, black, clock } = setup(1);
		// White to move with K+Q; black has a lone king. If white flags, black
		// cannot possibly mate, so it's a draw.
		(room as unknown as { chess: Chess }).chess.load('8/8/8/4k3/8/8/8/3QK3 w - - 0 1');
		clock.advance(61_000);
		room.onFlagFall();
		expect(black.last('gameOver')).toMatchObject({
			winner: 'draw',
			reason: 'timeoutVsInsufficient'
		});
	});

	it('awards the win on time when the opponent has mating material', () => {
		const { room, black, clock } = setup(1);
		clock.advance(61_000);
		room.onFlagFall();
		expect(black.last('gameOver')).toMatchObject({ winner: 'black', reason: 'timeout' });
	});
});

describe('abandonment claim (SM-1.6)', () => {
	it('refuses a claim during the grace period and grants it afterwards', () => {
		const { room, white, black, blackId, whiteId, clock } = setup(0, { graceMs: 30_000 });
		room.removePlayer(blackId, asWs(black));

		clock.advance(10_000);
		room.handleMessage(whiteId, { type: 'claimVictory' });
		expect(white.of('gameOver')).toHaveLength(0);

		clock.advance(25_000);
		room.handleMessage(whiteId, { type: 'claimVictory' });
		expect(white.last('gameOver')).toMatchObject({ winner: 'white', reason: 'abandonment' });
	});

	it('refuses a claim while the opponent is connected', () => {
		const { room, white, whiteId, clock } = setup(0, { graceMs: 0 });
		clock.advance(1);
		room.handleMessage(whiteId, { type: 'claimVictory' });
		expect(white.of('gameOver')).toHaveLength(0);
	});
});

describe('move broadcast normalisation', () => {
	it('relays only {from,to,promotion} derived from the validated move', () => {
		const { room, black, whiteId } = setup();
		room.handleMessage(whiteId, {
			type: 'move',
			move: { from: 'e2', to: 'e4', extra: 'x'.repeat(100) } as unknown as {
				from: string;
				to: string;
			}
		});
		expect(black.last('opponentMove')).toEqual({
			type: 'opponentMove',
			move: { from: 'e2', to: 'e4' }
		});
	});
});

describe('rematch', () => {
	it('one seat offering twice does not restart the game', () => {
		const { room, whiteId } = setup();
		room.handleMessage(whiteId, { type: 'resign' });
		room.handleMessage(whiteId, { type: 'offerRematch' });
		room.handleMessage(whiteId, { type: 'acceptRematch' });
		expect(room.gameStarted).toBe(false);
	});

	it('restarts once both seats agree', () => {
		const { room, white, whiteId, blackId } = setup();
		room.handleMessage(whiteId, { type: 'resign' });
		room.handleMessage(whiteId, { type: 'offerRematch' });
		room.handleMessage(blackId, { type: 'acceptRematch' });
		expect(room.gameStarted).toBe(true);
		expect(white.of('rematchAccepted')).toHaveLength(1);
	});
});

describe('draw offers (SM-6)', () => {
	it('offer + accept ends the game as a draw by agreement', () => {
		const { room, white, black, whiteId, blackId } = setup();
		room.handleMessage(whiteId, { type: 'offerDraw' });
		expect(black.of('drawOffer')).toHaveLength(1);
		room.handleMessage(blackId, { type: 'acceptDraw' });
		expect(white.last('gameOver')).toMatchObject({ winner: 'draw', reason: 'agreement' });
	});

	it('the offerer cannot accept their own offer', () => {
		const { room, white, whiteId } = setup();
		room.handleMessage(whiteId, { type: 'offerDraw' });
		room.handleMessage(whiteId, { type: 'acceptDraw' });
		expect(white.of('gameOver')).toHaveLength(0);
	});

	it('decline clears the offer and tells the offerer', () => {
		const { room, white, whiteId, blackId } = setup();
		room.handleMessage(whiteId, { type: 'offerDraw' });
		room.handleMessage(blackId, { type: 'declineDraw' });
		expect(white.of('drawDeclined')).toHaveLength(1);
		room.handleMessage(blackId, { type: 'acceptDraw' });
		expect(white.of('gameOver')).toHaveLength(0);
	});

	it('moving instead of answering declines, and offers cannot be spammed', () => {
		const { room, white, black, whiteId, blackId } = setup();
		room.handleMessage(whiteId, { type: 'offerDraw' });
		room.handleMessage(whiteId, { type: 'offerDraw' }); // duplicate ignored
		expect(black.of('drawOffer')).toHaveLength(1);
		room.handleMessage(whiteId, { type: 'move', move: { from: 'e2', to: 'e4' } });
		room.handleMessage(blackId, { type: 'move', move: { from: 'e7', to: 'e5' } });
		expect(white.of('drawDeclined')).toHaveLength(1);
		// White has moved since, so may offer again.
		room.handleMessage(whiteId, { type: 'offerDraw' });
		expect(black.of('drawOffer')).toHaveLength(2);
	});

	it('mutual offers are an agreement and the resync shows pending offers', () => {
		const { reconnect, room, white, whiteId, blackId } = setup();
		room.handleMessage(whiteId, { type: 'offerDraw' });
		const fresh = new FakeWs();
		reconnect(blackId, fresh);
		expect(fresh.last('gameState')).toMatchObject({ drawOffer: 'opponent' });
		room.handleMessage(blackId, { type: 'offerDraw' });
		expect(white.last('gameOver')).toMatchObject({ reason: 'agreement' });
	});
});

describe('rematch colour swap (SM-6)', () => {
	it('swaps colours and keeps each seat token with its player', () => {
		const { reconnect, room, white, black, whiteId, blackId } = setup();
		room.handleMessage(whiteId, { type: 'resign' });
		room.handleMessage(whiteId, { type: 'offerRematch' });
		room.handleMessage(blackId, { type: 'acceptRematch' });
		expect(white.last('rematchAccepted')).toMatchObject({ color: 'black' });
		expect(black.last('rematchAccepted')).toMatchObject({ color: 'white' });

		// The former black player now moves first, as white.
		room.handleMessage(blackId, { type: 'move', move: { from: 'e2', to: 'e4' } });
		expect(white.last('opponentMove')).toEqual({
			type: 'opponentMove',
			move: { from: 'e2', to: 'e4' }
		});

		// Reconnecting with the original token lands in the swapped colour.
		const fresh = new FakeWs();
		expect(reconnect(whiteId, fresh)).toBe(true);
		expect(fresh.last('seat')).toMatchObject({ color: 'black' });
	});
});

describe('joining after the creator left (CR-3)', () => {
	it("tells the joiner the creator is away, with grace measured from the creator's disconnect", () => {
		let now = 1_000_000;
		const room = new GameRoom({ time: 0, disconnectGraceMs: 60_000, now: () => now });
		const tokens = room.initialTokens();
		const creator = new FakeWs();
		const creatorId = room.claimSeat(tokens.white, asWs(creator))!.id;
		room.removePlayer(creatorId, asWs(creator));

		now += 20_000;
		const joiner = new FakeWs();
		const joinerId = room.claimSeat(tokens.black, asWs(joiner))!.id;

		expect(joiner.of('opponentJoined')).toHaveLength(0);
		expect(joiner.last('gameStart')).toMatchObject({
			opponentConnected: false,
			opponentGraceMs: 40_000
		});

		now += 40_000;
		room.handleMessage(joinerId, { type: 'claimVictory' });
		expect(joiner.last('gameOver')).toMatchObject({ winner: 'black', reason: 'abandonment' });
	});

	it('reports a present creator as connected', () => {
		const { white, black } = setup();
		expect(white.last('gameStart')).toMatchObject({
			opponentConnected: true,
			opponentGraceMs: null
		});
		expect(black.last('gameStart')).toMatchObject({
			opponentConnected: true,
			opponentGraceMs: null
		});
	});
});

describe('repeat draw offer at the same ply (CR-4)', () => {
	it('answers a refused re-offer with drawDeclined instead of silence', () => {
		const { room, white, black, whiteId, blackId } = setup();
		room.handleMessage(whiteId, { type: 'offerDraw' });
		room.handleMessage(blackId, { type: 'declineDraw' });
		expect(white.of('drawDeclined')).toHaveLength(1);

		// Same ply: refused, but the offerer is told so its UI doesn't stay on "Draw offered".
		room.handleMessage(whiteId, { type: 'offerDraw' });
		expect(black.of('drawOffer')).toHaveLength(1);
		expect(white.of('drawDeclined')).toHaveLength(2);
	});
});
