import { describe, it, expect } from 'vitest';
import { seatTokenFromHash, inviteLink } from './seat';

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
