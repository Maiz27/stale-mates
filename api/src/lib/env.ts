/**
 * Startup environment validation (audit M4).
 *
 * Validates the process environment and fails fast with a clear message on
 * invalid config. Merely-absent optional vars are NOT errors — the app keeps
 * its existing localhost defaults (app.ts falls back to localhost:5173, the
 * server falls back to port 3000). Only genuinely *invalid* values, or vars
 * that are required in production, are rejected.
 */

import { parseOrigins } from './origins';

export interface EnvInput {
	PORT?: string;
	ORIGIN?: string;
	ORIGIN_PATTERNS?: string;
	ROOM_TTL_MS?: string;
	DISCONNECT_GRACE_MS?: string;
	FIRST_MOVE_TIMEOUT_MS?: string;
	TRUST_PROXY?: string;
	MAX_WS_CONNECTIONS_PER_IP?: string;
	NODE_ENV?: string;
}

/**
 * Default number of reverse-proxy hops trusted for the client IP: none, so a
 * server exposed directly can't be fooled by a client-supplied X-Forwarded-For
 * (CR2-5). Deploys behind a proxy opt in (`fly.toml` sets `TRUST_PROXY=1`).
 */
export const DEFAULT_TRUST_PROXY_HOPS = 0;
/** Default cap on concurrent WebSocket connections from one client IP. */
export const DEFAULT_MAX_WS_CONNECTIONS_PER_IP = 20;

const isSet = (value: string | undefined): value is string =>
	value !== undefined && value.trim() !== '';

/**
 * How many reverse proxies in front of the server to trust when deriving the
 * client IP from X-Forwarded-For (Express `trust proxy` hop count; also used for
 * WebSocket connections). 0 = use the socket address and ignore the header —
 * right when the server is exposed directly, where trusting a hop would let a
 * client spoof its IP past the per-IP limits.
 */
export function trustProxyHops(env: EnvInput): number {
	return isSet(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : DEFAULT_TRUST_PROXY_HOPS;
}

/** Concurrent WebSocket connections allowed per client IP. */
export function maxWsConnectionsPerIp(env: EnvInput): number {
	return isSet(env.MAX_WS_CONNECTIONS_PER_IP)
		? Number(env.MAX_WS_CONNECTIONS_PER_IP)
		: DEFAULT_MAX_WS_CONNECTIONS_PER_IP;
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
	// Each ORIGIN entry must be a bare http(s) origin and each ORIGIN_PATTERNS
	// entry a tightly scoped https pattern; otherwise nothing could ever match
	// and multiplayer would be silently dead (CR3-1, CR3-2).
	errors.push(...parseOrigins(env).errors);

	// ROOM_TTL_MS: optional, but if present it must be a positive integer.
	if (env.ROOM_TTL_MS !== undefined && env.ROOM_TTL_MS.trim() !== '') {
		const ttl = Number(env.ROOM_TTL_MS);
		if (!Number.isInteger(ttl) || ttl <= 0) {
			errors.push(`ROOM_TTL_MS must be a positive integer in ms (got "${env.ROOM_TTL_MS}")`);
		}
	}

	// DISCONNECT_GRACE_MS: optional, but if present it must be a non-negative integer.
	if (env.DISCONNECT_GRACE_MS !== undefined && env.DISCONNECT_GRACE_MS.trim() !== '') {
		const grace = Number(env.DISCONNECT_GRACE_MS);
		if (!Number.isInteger(grace) || grace < 0) {
			errors.push(
				`DISCONNECT_GRACE_MS must be a non-negative integer in ms (got "${env.DISCONNECT_GRACE_MS}")`
			);
		}
	}

	// FIRST_MOVE_TIMEOUT_MS: optional, a positive integer (timed games are aborted
	// when a side doesn't make its first move within it).
	if (isSet(env.FIRST_MOVE_TIMEOUT_MS)) {
		const ms = Number(env.FIRST_MOVE_TIMEOUT_MS);
		if (!Number.isInteger(ms) || ms <= 0) {
			errors.push(
				`FIRST_MOVE_TIMEOUT_MS must be a positive integer in ms (got "${env.FIRST_MOVE_TIMEOUT_MS}")`
			);
		}
	}

	// TRUST_PROXY: optional hop count, a non-negative integer.
	if (isSet(env.TRUST_PROXY)) {
		const hops = Number(env.TRUST_PROXY);
		if (!Number.isInteger(hops) || hops < 0) {
			errors.push(
				`TRUST_PROXY must be a non-negative integer (proxy hops) (got "${env.TRUST_PROXY}")`
			);
		}
	}

	// MAX_WS_CONNECTIONS_PER_IP: optional, a positive integer.
	if (isSet(env.MAX_WS_CONNECTIONS_PER_IP)) {
		const max = Number(env.MAX_WS_CONNECTIONS_PER_IP);
		if (!Number.isInteger(max) || max <= 0) {
			errors.push(
				`MAX_WS_CONNECTIONS_PER_IP must be a positive integer (got "${env.MAX_WS_CONNECTIONS_PER_IP}")`
			);
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
