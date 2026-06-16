/**
 * Startup environment validation (audit M4).
 *
 * Validates the process environment and fails fast with a clear message on
 * invalid config. Merely-absent optional vars are NOT errors — the app keeps
 * its existing localhost defaults (app.ts falls back to localhost:5173, the
 * server falls back to port 3000). Only genuinely *invalid* values, or vars
 * that are required in production, are rejected.
 */

export interface EnvInput {
	PORT?: string;
	ORIGIN?: string;
	ROOM_TTL_MS?: string;
	NODE_ENV?: string;
}

export interface EnvValidationResult {
	ok: boolean;
	errors: string[];
}

/**
 * Pure validator: inspects the given env object and returns the list of
 * problems found. Does not read `process.env` or throw, so it is trivially
 * unit-testable.
 */
export function validateEnv(env: EnvInput): EnvValidationResult {
	const errors: string[] = [];
	const isProduction = env.NODE_ENV === 'production';

	// PORT: optional, but if present it must be an integer in the valid TCP range.
	if (env.PORT !== undefined && env.PORT.trim() !== '') {
		const port = Number(env.PORT);
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			errors.push(`PORT must be an integer between 1 and 65535 (got "${env.PORT}")`);
		}
	}

	// ORIGIN: optional in development (localhost default), required in production
	// so we never accidentally ship a permissive/localhost CORS origin.
	if (isProduction && (env.ORIGIN === undefined || env.ORIGIN.trim() === '')) {
		errors.push('ORIGIN is required in production');
	}

	// ROOM_TTL_MS: optional, but if present it must be a positive integer.
	if (env.ROOM_TTL_MS !== undefined && env.ROOM_TTL_MS.trim() !== '') {
		const ttl = Number(env.ROOM_TTL_MS);
		if (!Number.isInteger(ttl) || ttl <= 0) {
			errors.push(`ROOM_TTL_MS must be a positive integer in ms (got "${env.ROOM_TTL_MS}")`);
		}
	}

	return { ok: errors.length === 0, errors };
}

/**
 * Validate `process.env` at startup and throw with an aggregated, readable
 * message if anything is invalid. Call this once from index.ts before listen().
 */
export function assertValidEnv(env: EnvInput = process.env): void {
	const result = validateEnv(env);
	if (!result.ok) {
		throw new Error(`Invalid environment configuration:\n  - ${result.errors.join('\n  - ')}`);
	}
}
