import { describe, it, expect, vi } from 'vitest';

vi.mock('js-cookie', () => {
	const jar = new Map<string, string>();
	return {
		default: {
			get: (key: string) => jar.get(key),
			set: (key: string, value: string) => jar.set(key, value)
		}
	};
});

import Cookies from 'js-cookie';
import { formatTime, GetItemFromCookies, AddItemToCookies } from './utils';
import { PLAYER_ID_EXPIRATION } from './constants';

describe('formatTime (SM-2.7)', () => {
	it('floors instead of rounding so it never shows ":60"', () => {
		expect(formatTime(59.6)).toBe('00:59');
		expect(formatTime(119.9)).toBe('01:59');
		expect(formatTime(60)).toBe('01:00');
	});

	it('clamps negatives and handles Infinity', () => {
		expect(formatTime(-3)).toBe('00:00');
		expect(formatTime(Infinity)).toBe('Unlimited');
	});
});

describe('cookies (SM-2.8 / SM-2.9)', () => {
	it('expires the player id after 4 hours, expressed in days for js-cookie', () => {
		expect(PLAYER_ID_EXPIRATION).toBeCloseTo(4 / 24);
	});

	it('round-trips a value', () => {
		AddItemToCookies({ key: 'k', value: 'v', expiration: 1 });
		expect(GetItemFromCookies('k')).toBe('v');
	});

	it('returns null for a corrupted cookie instead of throwing', () => {
		Cookies.set('bad', '{not json');
		expect(GetItemFromCookies('bad')).toBeNull();
		Cookies.set('shape', '"just a string"');
		expect(GetItemFromCookies('shape')).toBeNull();
	});
});
