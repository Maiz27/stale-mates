import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	seatTokenFromHash,
	inviteLink,
	getSeatToken,
	setSeatToken,
	getInviteToken,
	setInviteToken,
	clearSeat,
	resolveSeatToken,
	SEAT_TTL_MS
} from './seat';

/** Minimal Web Storage stand-in. */
class MemoryStorage implements Storage {
	private map = new Map<string, string>();
	get length() {
		return this.map.size;
	}
	clear() {
		this.map.clear();
	}
	getItem(key: string) {
		return this.map.get(key) ?? null;
	}
	key(i: number) {
		return [...this.map.keys()][i] ?? null;
	}
	removeItem(key: string) {
		this.map.delete(key);
	}
	setItem(key: string, value: string) {
		this.map.set(key, String(value));
	}
}

describe('seat helpers', () => {
	it('round-trips a token through the invite link fragment', () => {
		const link = inviteLink('https://x.test', 'room 1', 'abcDEF123_-xyz');
		expect(link).toBe('https://x.test/room?id=room%201#seat=abcDEF123_-xyz');
		expect(seatTokenFromHash(new URL(link).hash)).toBe('abcDEF123_-xyz');
	});

	it('ignores missing or malformed tokens', () => {
		expect(seatTokenFromHash('')).toBeNull();
		expect(seatTokenFromHash('#seat=')).toBeNull();
		expect(seatTokenFromHash('#seat=<script>')).toBeNull();
	});
});

describe('seat storage survives closing the tab (CR-5)', () => {
	let local: MemoryStorage;
	let session: MemoryStorage;
	beforeEach(() => {
		local = new MemoryStorage();
		session = new MemoryStorage();
		vi.stubGlobal('localStorage', local);
		vi.stubGlobal('sessionStorage', session);
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('keeps seat and invite tokens in localStorage, per room', () => {
		setSeatToken('r1', 'seat-token-r1');
		setInviteToken('r1', 'invite-token-r1');
		setSeatToken('r2', 'seat-token-r2');
		expect(session.length).toBe(0);
		expect(getSeatToken('r1')).toBe('seat-token-r1');
		expect(getInviteToken('r1')).toBe('invite-token-r1');
		expect(getSeatToken('r2')).toBe('seat-token-r2');
	});

	it('expires entries after SEAT_TTL_MS and cleans old rooms up on write', () => {
		setSeatToken('old', 'seat-token-old');
		vi.setSystemTime(1_000_000 + SEAT_TTL_MS + 1);
		expect(getSeatToken('old')).toBeNull();
		setSeatToken('new', 'seat-token-new');
		expect(local.getItem('stalemates:seat:old')).toBeNull();
		expect(getSeatToken('new')).toBe('seat-token-new');
	});

	it('refreshes the expiry when a seat is saved again', () => {
		setSeatToken('r1', 'seat-token-r1');
		vi.setSystemTime(1_000_000 + SEAT_TTL_MS - 1000);
		setSeatToken('r1', 'seat-token-r1');
		vi.setSystemTime(1_000_000 + SEAT_TTL_MS + 1000);
		expect(getSeatToken('r1')).toBe('seat-token-r1');
	});

	it('clearSeat forgets a room', () => {
		setSeatToken('r1', 'seat-token-r1');
		setInviteToken('r1', 'invite-token-r1');
		clearSeat('r1');
		expect(getSeatToken('r1')).toBeNull();
		expect(getInviteToken('r1')).toBeNull();
	});

	it('still reads a legacy per-tab sessionStorage token', () => {
		session.setItem('stalemates:seat:r1', 'legacy-token-r1');
		expect(getSeatToken('r1')).toBe('legacy-token-r1');
	});

	it('resumes a seat already held in this browser instead of using an invite link', () => {
		setSeatToken('r1', 'my-seat-token');
		setInviteToken('r1', 'invite-token-r1');
		// The creator opens their own invite link: keep their seat.
		expect(resolveSeatToken('r1', 'invite-token-r1')).toBe('my-seat-token');
		// The joiner reopens the (now spent) invite link: keep the rotated seat.
		expect(resolveSeatToken('r1', 'spent-invite-token')).toBe('my-seat-token');
		// A fresh browser takes the invite token and stores it.
		expect(resolveSeatToken('r2', 'invite-token-r2')).toBe('invite-token-r2');
		expect(getSeatToken('r2')).toBe('invite-token-r2');
		expect(resolveSeatToken('r3', null)).toBeNull();
	});
});
