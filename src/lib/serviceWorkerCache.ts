/**
 * Cache policy for the service worker (src/service-worker/index.ts), kept as
 * pure functions so it can be unit-tested (CR-9).
 */

/** Long-lived cache for the versioned Stockfish files; survives deploys. */
export const ENGINE_CACHE = 'stalemates-engine';

/** Per-build app caches are `stalemates-<build version>`. */
export const APP_CACHE_PREFIX = 'stalemates-';
export const appCacheName = (version: string) => `${APP_CACHE_PREFIX}${version}`;

/**
 * How many previous builds' app caches survive an update (CR2-8). The new
 * service worker takes over open tabs at once (`skipWaiting` + `claim`), and a
 * tab still running an older build lazily loads that build's content-hashed
 * chunks — which the server stops serving after a deploy. Keeping the last
 * couple of builds' caches (and looking chunks up in every cache) lets those
 * tabs keep working until they're reloaded.
 */
export const PREVIOUS_BUILDS_KEPT = 2;

const ENGINE_DIR = /^\/engine\/[^/]+\//;

/**
 * Navigations are cached by path only. Every `/room?id=…` URL serves the same
 * prerendered shell, so caching each full URL would grow the cache by one page
 * per room ever visited.
 */
export function navigationCacheKey(url: URL): string {
	return url.pathname;
}

/**
 * Caches to delete on activate: everything but the current app cache, the
 * engine cache and the `keep` most recent previous app caches. `keys` is in
 * `caches.keys()` order, which is creation order (oldest first).
 */
export function staleCaches(
	keys: string[],
	current: string,
	keep: number = PREVIOUS_BUILDS_KEPT
): string[] {
	const others = keys.filter((key) => key !== current && key !== ENGINE_CACHE);
	const previousBuilds = others.filter((key) => key.startsWith(APP_CACHE_PREFIX));
	const kept = new Set(keep > 0 ? previousBuilds.slice(-keep) : []);
	return others.filter((key) => !kept.has(key));
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

/**
 * Stores a response copy in the cache and hands the write to `keepAlive`
 * (the fetch event's `waitUntil`), so the browser doesn't stop the worker
 * before the write lands. A failed write (quota, storage error) is swallowed:
 * the network response is still returned, it just isn't cached.
 */
export function retainCacheWrite(
	keepAlive: (promise: Promise<unknown>) => void,
	cache: Pick<Cache, 'put'>,
	key: RequestInfo,
	response: Response
): void {
	keepAlive(cache.put(key, response.clone()).catch(() => undefined));
}
