import { describe, it, expect } from 'vitest';
import { formatTime } from './utils';

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
