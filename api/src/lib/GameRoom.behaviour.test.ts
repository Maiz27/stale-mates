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

function setup(time: TimeOption = 0, opts: { graceMs?: number; firstMoveTimeoutMs?: number } = {}) {
	let now = 1_000_000;
	const clock = {
		get: () => now,
		advance: (ms: number) => {
			now += ms;
		}
	};
	const room = new GameRoom({
		time,
		disconnectGraceMs: opts.graceMs ?? 60_000,
		firstMoveTimeoutMs: opts.firstMoveTimeoutMs,
		now: clock.get
	});
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

/** Play 1. e4 e5: clocks only run once both sides have made their first move (CR3-4). */
function playFirstMoves(room: GameRoom, whiteId: string, blackId: string) {
	room.handleMessage(whiteId, { type: 'move', move: { from: 'e2', to: 'e4' } });
	room.handleMessage(blackId, { type: 'move', move: { from: 'e7', to: 'e5' } });
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
		const { room, white, black, whiteId, blackId, clock } = setup(1); // 60s + 3s
		playFirstMoves(room, whiteId, blackId);
		white.clear();
		black.clear();
		clock.advance(61_000); // white's clock ran out; the watchdog hasn't fired yet
		room.handleMessage(whiteId, { type: 'move', move: { from: 'g1', to: 'f3' } });

		expect(white.of('opponentMove')).toHaveLength(0);
		expect(black.of('opponentMove')).toHaveLength(0);
		expect(black.last('gameOver')).toMatchObject({ winner: 'black', reason: 'timeout' });
		expect(room.gameStarted).toBe(false);
	});

	it('resyncs the mover after a late move so its optimistic move is undone (CR2-4)', () => {
		const { room, white, black, whiteId, blackId, clock } = setup(1);
		playFirstMoves(room, whiteId, blackId);
		room.handleMessage(whiteId, { type: 'move', move: { from: 'g1', to: 'f3' } });
		clock.advance(70_000); // black flags before its reply reaches the server
		black.clear();
		white.clear();
		room.handleMessage(blackId, { type: 'move', move: { from: 'b8', to: 'c6' } });

		expect(black.last('gameOver')).toMatchObject({ winner: 'white', reason: 'timeout' });
		// The mover's board showed e7e5; the authoritative state follows the result.
		const sent = black.sent.map((m) => m.type);
		expect(sent.indexOf('gameState')).toBeGreaterThan(sent.indexOf('gameOver'));
		expect(black.last('gameState')).toMatchObject({
			moves: ['e2e4', 'e7e5', 'g1f3'],
			gameOver: { winner: 'white', reason: 'timeout' }
		});
		expect(white.of('opponentMove')).toHaveLength(0);
	});

	it('scores a timeout against a lone king as a draw', () => {
		const { room, black, whiteId, blackId, clock } = setup(1);
		playFirstMoves(room, whiteId, blackId);
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

	it('scores a timeout against K+N vs a lone king as a draw (CR-6)', () => {
		const { room, black, whiteId, blackId, clock } = setup(1);
		playFirstMoves(room, whiteId, blackId);
		// White flags; black has only K+N against white's lone king: no mate possible.
		(room as unknown as { chess: Chess }).chess.load('8/8/8/4k3/8/8/2n5/4K3 w - - 0 1');
		clock.advance(61_000);
		room.onFlagFall();
		expect(black.last('gameOver')).toMatchObject({
			winner: 'draw',
			reason: 'timeoutVsInsufficient'
		});
	});

	it('clears the pending watchdog when a late move triggers the flag check (CR-7)', () => {
		const { room, whiteId, blackId, clock } = setup(1);
		playFirstMoves(room, whiteId, blackId);
		expect(vi.getTimerCount()).toBe(1); // the flag watchdog for white
		clock.advance(61_000); // fake clock only: the watchdog hasn't fired
		room.handleMessage(whiteId, { type: 'move', move: { from: 'g1', to: 'f3' } });
		expect(room.gameStarted).toBe(false);
		expect(room.stateMessageFor(room.players[0]).gameOver?.reason).toBe('timeout');
		expect(vi.getTimerCount()).toBe(0);
	});

	it('awards the win on time when the opponent has mating material', () => {
		const { room, black, whiteId, blackId, clock } = setup(1);
		playFirstMoves(room, whiteId, blackId);
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
	it('tells the joiner the creator is away; the full grace runs from game start (CR2-3)', () => {
		let now = 1_000_000;
		const room = new GameRoom({ time: 0, disconnectGraceMs: 60_000, now: () => now });
		const tokens = room.initialTokens();
		const creator = new FakeWs();
		const creatorId = room.claimSeat(tokens.white, asWs(creator))!.id;
		room.removePlayer(creatorId, asWs(creator));

		// The creator left the waiting room well over a grace period ago.
		now += 20 * 60_000;
		const joiner = new FakeWs();
		const joinerId = room.claimSeat(tokens.black, asWs(joiner))!.id;

		expect(joiner.of('opponentJoined')).toHaveLength(0);
		expect(joiner.last('gameStart')).toMatchObject({
			opponentConnected: false,
			opponentGraceMs: 60_000
		});

		// No instant win by abandonment before a move could even be played.
		room.handleMessage(joinerId, { type: 'claimVictory' });
		expect(joiner.of('gameOver')).toHaveLength(0);

		now += 20_000;
		expect(room.stateMessageFor(room.players[1])).toMatchObject({ opponentGraceMs: 40_000 });
		room.handleMessage(joinerId, { type: 'claimVictory' });
		expect(joiner.of('gameOver')).toHaveLength(0);

		now += 40_000;
		room.handleMessage(joinerId, { type: 'claimVictory' });
		expect(joiner.last('gameOver')).toMatchObject({ winner: 'black', reason: 'abandonment' });
	});

	it('restarts the grace when a rematch starts with a player away (CR2-3)', () => {
		const { room, white, black, whiteId, blackId, clock } = setup(0, { graceMs: 60_000 });
		room.handleMessage(whiteId, { type: 'resign' });
		room.handleMessage(whiteId, { type: 'offerRematch' });
		room.handleMessage(blackId, { type: 'acceptRematch' });
		room.handleMessage(whiteId, { type: 'resign' });
		// Black offers a rematch and leaves; white accepts long after.
		room.handleMessage(blackId, { type: 'offerRematch' });
		room.removePlayer(blackId, asWs(black));
		clock.advance(5 * 60_000);
		white.clear();
		room.handleMessage(whiteId, { type: 'acceptRematch' });
		expect(white.of('rematchAccepted')).toHaveLength(1);
		room.handleMessage(whiteId, { type: 'claimVictory' });
		expect(white.of('gameOver')).toHaveLength(0);
		clock.advance(60_000);
		room.handleMessage(whiteId, { type: 'claimVictory' });
		expect(white.last('gameOver')).toMatchObject({ reason: 'abandonment' });
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

describe('first moves and the first-move timeout (CR3-4)', () => {
	type Snap = {
		whiteMs: number;
		blackMs: number;
		running: string | null;
		firstMoveMs: number | null;
	};
	const clockOf = (room: GameRoom) => room.stateMessageFor(room.players[0]).clock as Snap;
	/** Advance the room's clock and fire any watchdog that is due. */
	const elapse = (clock: { advance: (ms: number) => void }, ms: number) => {
		clock.advance(ms);
		vi.advanceTimersByTime(ms);
	};

	it('starts a timed game with no clock running and White’s first-move window', () => {
		const { room, white, clock } = setup(1, { firstMoveTimeoutMs: 30_000 });
		expect(white.last('gameStart')).toMatchObject({
			clock: { whiteMs: 60_000, blackMs: 60_000, running: null, firstMoveMs: 30_000 }
		});
		elapse(clock, 20_000);
		expect(clockOf(room)).toMatchObject({
			whiteMs: 60_000,
			blackMs: 60_000,
			running: null,
			firstMoveMs: 10_000
		});
		expect(room.gameStarted).toBe(true);
	});

	it('does not run Black’s clock before Black’s first move, then runs clocks with increment', () => {
		const { room, white, black, whiteId, blackId, clock } = setup(1, {
			firstMoveTimeoutMs: 30_000
		});
		elapse(clock, 5_000);
		room.handleMessage(whiteId, { type: 'move', move: { from: 'e2', to: 'e4' } });
		// White's first move cost nothing and earned no increment; Black now has the window.
		expect(black.last('clock')).toMatchObject({
			clock: { whiteMs: 60_000, blackMs: 60_000, running: null, firstMoveMs: 30_000 }
		});
		elapse(clock, 25_000);
		expect(clockOf(room)).toMatchObject({ blackMs: 60_000, running: null, firstMoveMs: 5_000 });

		room.handleMessage(blackId, { type: 'move', move: { from: 'e7', to: 'e5' } });
		// Both have moved: White's clock runs, the window is gone.
		expect(white.last('clock')).toMatchObject({
			clock: { whiteMs: 60_000, blackMs: 60_000, running: 'white', firstMoveMs: null }
		});
		elapse(clock, 4_000);
		expect(clockOf(room)).toMatchObject({ whiteMs: 56_000, running: 'white' });
		room.handleMessage(whiteId, { type: 'move', move: { from: 'g1', to: 'f3' } });
		// 60 - 4 + 3 s increment.
		expect(clockOf(room)).toMatchObject({ whiteMs: 59_000, blackMs: 60_000, running: 'black' });
		expect(room.gameStarted).toBe(true);
	});

	it('aborts the game when White does not make a first move in time', () => {
		const { room, white, black, clock } = setup(3, { firstMoveTimeoutMs: 30_000 });
		elapse(clock, 29_999);
		expect(room.gameStarted).toBe(true);
		elapse(clock, 1);
		for (const ws of [white, black]) {
			expect(ws.last('gameOver')).toMatchObject({
				winner: null,
				reason: 'aborted',
				clock: { whiteMs: 180_000, blackMs: 180_000, running: null, firstMoveMs: null }
			});
		}
		expect(room.stateMessageFor(room.players[0]).gameOver).toEqual({
			winner: null,
			reason: 'aborted'
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it('aborts the game when Black does not answer White’s first move in time', () => {
		const { room, black, whiteId, clock } = setup(1, { firstMoveTimeoutMs: 30_000 });
		elapse(clock, 20_000);
		room.handleMessage(whiteId, { type: 'move', move: { from: 'e2', to: 'e4' } });
		elapse(clock, 29_000);
		expect(room.gameStarted).toBe(true); // Black gets its own full window
		elapse(clock, 1_000);
		expect(black.last('gameOver')).toMatchObject({ winner: null, reason: 'aborted' });
	});

	it('aborts on a first move that arrives after the deadline, and resyncs the mover', () => {
		const { room, white, black, whiteId, clock } = setup(1, { firstMoveTimeoutMs: 30_000 });
		clock.advance(30_000); // the watchdog hasn't fired yet
		white.clear();
		room.handleMessage(whiteId, { type: 'move', move: { from: 'e2', to: 'e4' } });
		expect(black.of('opponentMove')).toHaveLength(0);
		expect(white.last('gameOver')).toMatchObject({ winner: null, reason: 'aborted' });
		expect(white.last('gameState')).toMatchObject({
			moves: [],
			gameOver: { winner: null, reason: 'aborted' }
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it('allows a rematch after an abort, with a fresh first-move window', () => {
		const { room, white, black, whiteId, blackId, clock } = setup(1, {
			firstMoveTimeoutMs: 30_000
		});
		elapse(clock, 30_000);
		room.handleMessage(whiteId, { type: 'offerRematch' });
		room.handleMessage(blackId, { type: 'acceptRematch' });
		expect(white.last('rematchAccepted')).toMatchObject({
			color: 'black',
			clock: { running: null, firstMoveMs: 30_000 }
		});
		expect(black.last('rematchAccepted')).toMatchObject({ color: 'white' });
		expect(room.gameStarted).toBe(true);
	});

	it('refuses a win-by-abandonment claim before both sides have moved', () => {
		const { room, white, black, whiteId, blackId, clock } = setup(1, {
			graceMs: 10_000,
			firstMoveTimeoutMs: 30_000
		});
		room.handleMessage(whiteId, { type: 'move', move: { from: 'e2', to: 'e4' } });
		room.removePlayer(blackId, asWs(black));
		elapse(clock, 15_000); // past the grace, but Black hasn't made its first move
		room.handleMessage(whiteId, { type: 'claimVictory' });
		expect(white.of('gameOver')).toHaveLength(0);
		// Black never comes back to move: the game is aborted, not won.
		elapse(clock, 15_000);
		expect(white.last('gameOver')).toMatchObject({ winner: null, reason: 'aborted' });
	});

	it('allows the claim once both sides have moved', () => {
		const { room, white, black, whiteId, blackId, clock } = setup(10, { graceMs: 10_000 });
		playFirstMoves(room, whiteId, blackId);
		room.removePlayer(blackId, asWs(black));
		elapse(clock, 10_000);
		room.handleMessage(whiteId, { type: 'claimVictory' });
		expect(white.last('gameOver')).toMatchObject({ winner: 'white', reason: 'abandonment' });
	});

	it('aborts on reconnect when the window passed while nobody was connected', () => {
		const { room, white, black, whiteId, blackId, clock, reconnect } = setup(1, {
			firstMoveTimeoutMs: 30_000
		});
		room.removePlayer(whiteId, asWs(white));
		room.removePlayer(blackId, asWs(black));
		expect(vi.getTimerCount()).toBe(0);
		clock.advance(60_000);
		const back = new FakeWs();
		reconnect(whiteId, back);
		vi.advanceTimersByTime(0);
		expect(back.last('gameOver')).toMatchObject({ winner: null, reason: 'aborted' });
	});

	it('leaves untimed games alone: no window, no abort', () => {
		const { room, white, clock } = setup(0, { firstMoveTimeoutMs: 30_000 });
		expect(white.last('gameStart')).toMatchObject({ clock: { running: null, firstMoveMs: null } });
		expect(vi.getTimerCount()).toBe(0);
		elapse(clock, 10 * 60_000);
		expect(room.gameStarted).toBe(true);
	});

	it('defaults the window to 30 s', () => {
		const { white } = setup(1);
		expect(white.last('gameStart')).toMatchObject({ clock: { firstMoveMs: 30_000 } });
	});
});
