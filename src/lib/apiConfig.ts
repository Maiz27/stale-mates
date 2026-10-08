/**
 * Where the multiplayer game server lives (CR2-2).
 *
 * Vite bakes `VITE_API_URL` / `VITE_API_WS_URL` into the bundle at build time.
 * The repo's `.env` is gitignored, so a fresh checkout has neither: rather than
 * calling `undefined/game/join`, a dev server falls back to the local API on
 * :3000, the WebSocket URL is derived from the HTTP one when only that is set,
 * and a production build without them reports "not configured" (`null`) so the
 * UI can say so.
 */

export interface ApiEnv {
	VITE_API_URL?: string;
	VITE_API_WS_URL?: string;
	DEV?: boolean;
}

export interface ApiUrls {
	/** HTTP(S) base URL, e.g. `https://api.example.com`, or null when not configured. */
	http: string | null;
	/** WS(S) base URL, e.g. `wss://api.example.com`, or null when not configured. */
	ws: string | null;
}

/** The local API (`cd api && bun run dev`) used by a dev server with no env set. */
export const DEV_API_URL = 'http://localhost:3000';

const clean = (value: string | undefined): string | null => {
	const trimmed = value?.trim().replace(/\/+$/, '');
	return trimmed ? trimmed : null;
};

export function resolveApiUrls(env: ApiEnv): ApiUrls {
	const http = clean(env.VITE_API_URL) ?? (env.DEV ? DEV_API_URL : null);
	const derivedWs = http && /^https?:\/\//i.test(http) ? http.replace(/^http/i, 'ws') : null;
	return { http, ws: clean(env.VITE_API_WS_URL) ?? derivedWs };
}

/** This build's game-server URLs. */
export const apiUrls: ApiUrls = resolveApiUrls(import.meta.env);

/** Shown when the build has no game server configured. */
export const API_NOT_CONFIGURED_MESSAGE =
	"Multiplayer isn't available: this build has no game server configured.";
