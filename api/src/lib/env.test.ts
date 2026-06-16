import { describe, it, expect } from 'vitest';
import { validateEnv, assertValidEnv } from './env';

describe('validateEnv', () => {
	it('accepts a fully empty env (all defaults apply)', () => {
		expect(validateEnv({})).toEqual({ ok: true, errors: [] });
	});

	it('accepts a valid PORT', () => {
		expect(validateEnv({ PORT: '3000' }).ok).toBe(true);
	});

	it('ignores a blank PORT', () => {
		expect(validateEnv({ PORT: '   ' }).ok).toBe(true);
	});

	it('rejects a non-numeric PORT', () => {
		const result = validateEnv({ PORT: 'abc' });
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toContain('PORT');
	});

	it('rejects an out-of-range PORT', () => {
		expect(validateEnv({ PORT: '70000' }).ok).toBe(false);
		expect(validateEnv({ PORT: '0' }).ok).toBe(false);
	});

	it('rejects a non-integer PORT', () => {
		expect(validateEnv({ PORT: '3000.5' }).ok).toBe(false);
	});

	it('does not require ORIGIN outside production', () => {
		expect(validateEnv({ NODE_ENV: 'development' }).ok).toBe(true);
	});

	it('requires ORIGIN in production', () => {
		const result = validateEnv({ NODE_ENV: 'production' });
		expect(result.ok).toBe(false);
		expect(result.errors.some((e) => e.includes('ORIGIN'))).toBe(true);
	});

	it('accepts production when ORIGIN is set', () => {
		expect(validateEnv({ NODE_ENV: 'production', ORIGIN: 'https://example.com' }).ok).toBe(true);
	});

	it('rejects a non-positive ROOM_TTL_MS', () => {
		expect(validateEnv({ ROOM_TTL_MS: '0' }).ok).toBe(false);
		expect(validateEnv({ ROOM_TTL_MS: '-1' }).ok).toBe(false);
	});

	it('accepts a valid ROOM_TTL_MS', () => {
		expect(validateEnv({ ROOM_TTL_MS: '60000' }).ok).toBe(true);
	});

	it('aggregates multiple errors', () => {
		const result = validateEnv({ PORT: 'x', NODE_ENV: 'production', ROOM_TTL_MS: 'y' });
		expect(result.ok).toBe(false);
		expect(result.errors.length).toBe(3);
	});
});

describe('assertValidEnv', () => {
	it('does not throw on valid env', () => {
		expect(() => assertValidEnv({ PORT: '3000' })).not.toThrow();
	});

	it('throws a readable aggregated message on invalid env', () => {
		expect(() => assertValidEnv({ PORT: 'bad' })).toThrow(/Invalid environment configuration/);
	});
});
