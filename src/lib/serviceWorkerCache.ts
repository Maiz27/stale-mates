/**
 * Cache policy for the service worker (src/service-worker/index.ts), kept as
 * pure functions so it can be unit-tested (CR-9).
 */

/** Long-lived cache for the versioned Stockfish files; survives deploys. */
export const ENGINE_CACHE = 'stalemates-engine';

const ENGINE_DIR = /^\/engine\/[^/]+\//;

/**
 * Navigations are cached by path only. Every `/room?id=…` URL serves the same
 * prerendered shell, so caching each full URL would grow the cache by one page
 * per room ever visited.
 */
export function navigationCacheKey(url: URL): string {
	return url.pathname;
}

/** Caches to delete on activate: everything but the current app cache and the engine cache. */
export function staleCaches(keys: string[], current: string): string[] {
	return keys.filter((key) => key !== current && key !== ENGINE_CACHE);
}

/** The `/engine/<version>/` directories present in this build's static assets. */
export function engineDirs(paths: string[]): Set<string> {
	const dirs = new Set<string>();
	for (const path of paths) {
		const match = ENGINE_DIR.exec(path);
		if (match) dirs.add(match[0]);
	}
	return dirs;
}

/** Whether a cached engine file belongs to an engine version this build no longer ships. */
export function isStaleEngine(pathname: string, current: Set<string>): boolean {
	const match = ENGINE_DIR.exec(pathname);
	return !match || !current.has(match[0]);
}
