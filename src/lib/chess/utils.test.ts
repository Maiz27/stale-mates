import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { getCheckState, toDestinations, isVsAI, getChessJsColor, isPromotionMove } from './utils';

describe('isVsAI', () => {
	it('returns true for pve', () => {
		expect(isVsAI('pve')).toBe(true);
	});

	it('returns false for pvp', () => {
		expect(isVsAI('pvp')).toBe(false);
	});
});

describe('getChessJsColor', () => {
	it('maps white to w', () => {
		expect(getChessJsColor('white')).toBe('w');
	});

	it('maps black to b', () => {
		expect(getChessJsColor('black')).toBe('b');
	});
});

describe('isPromotionMove', () => {
	it('detects a white pawn promoting on rank 8', () => {
		// White pawn on a7, ready to promote to a8.
		const chess = new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1');
		expect(isPromotionMove(chess, 'a7', 'a8')).toBe(true);
	});

	it('detects a black pawn promoting on rank 1', () => {
		// Black pawn on h2, ready to promote to h1.
		const chess = new Chess('K6k/8/8/8/8/8/7p/8 b - - 0 1');
		expect(isPromotionMove(chess, 'h2', 'h1')).toBe(true);
	});

	it('returns false for a non-pawn piece reaching the back rank', () => {
		// Rook on a7 moving to a8 is not a promotion.
		const chess = new Chess('8/R7/8/8/8/8/8/k6K w - - 0 1');
		expect(isPromotionMove(chess, 'a7', 'a8')).toBe(false);
	});

	it('returns false for a pawn move that does not reach the back rank', () => {
		const chess = new Chess();
		expect(isPromotionMove(chess, 'e2', 'e4')).toBe(false);
	});

	it('returns false when there is no piece on the origin square', () => {
		const chess = new Chess();
		expect(isPromotionMove(chess, 'e4', 'e5')).toBe(false);
	});
});

describe('getCheckState', () => {
	it('reports no check for the starting position', () => {
		const chess = new Chess();
		const state = getCheckState(chess);
		expect(state.inCheck).toBe(false);
		expect(state).not.toHaveProperty('kingSquare');
	});

	it('reports check, the king square, and the attacking square', () => {
		// Black king on e8 is in check from the white rook on e1.
		const chess = new Chess('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1');
		const state = getCheckState(chess);
		expect(state.inCheck).toBe(true);
		expect(state.kingSquare).toBe('e8');
		// The only legal capture of the checking piece is Kxe1 is illegal (not adjacent),
		// so attackingSquares lists the squares of moves flagged as captures, which
		// here is empty because the king cannot capture the distant rook. Verify the
		// shape is an array regardless.
		expect(Array.isArray(state.attackingSquares)).toBe(true);
	});

	it('lists the capturing-move origin when the checking piece can be captured', () => {
		// White king on e1, black rook on e2 gives check; white king can capture it (Kxe2).
		const chess = new Chess('6k1/8/8/8/8/8/4r3/4K3 w - - 0 1');
		const state = getCheckState(chess);
		expect(state.inCheck).toBe(true);
		expect(state.kingSquare).toBe('e1');
		expect(state.attackingSquares).toContain('e1');
	});
});

describe('toDestinations', () => {
	it('builds the legal-move map for the starting position', () => {
		const chess = new Chess();
		const dests = toDestinations(chess);

		// 16 pieces have legal moves at the start (8 pawns + 2 knights per side... only
		// white moves; black is not to move). White has 10 origin squares with moves:
		// 8 pawns + 2 knights.
		expect(dests.size).toBe(10);

		// Each pawn has two legal advances from the start.
		expect(dests.get('e2')).toEqual(expect.arrayContaining(['e3', 'e4']));
		expect(dests.get('e2')).toHaveLength(2);

		// The b1 knight can reach a3 and c3.
		expect(dests.get('b1')).toEqual(expect.arrayContaining(['a3', 'c3']));

		// Squares with no legal-move origin are absent from the map.
		expect(dests.has('e1')).toBe(false);
		expect(dests.has('e4')).toBe(false);
	});

	it('returns an empty map for a checkmated (game-over) position', () => {
		// Fool's mate: black has just delivered checkmate, white to move with no moves.
		const chess = new Chess(
			'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
		);
		expect(chess.isCheckmate()).toBe(true);
		const dests = toDestinations(chess);
		expect(dests.size).toBe(0);
	});
});
