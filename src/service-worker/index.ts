/**
 * Offline support (audit SM-6), modest scope: AI mode works offline once the
 * site has been visited online.
 *
 * - Precache the app shell: every build chunk (except the multi-MB engine
 *   `.wasm`), static files and the prerendered pages. Each file is cached on its
 *   own, so one failed fetch doesn't abort the install (CR-9).
 * - Content-hashed `/_app/immutable/` files are cached at runtime, cache-first,
 *   looked up in every cache: the new worker takes over open tabs right away,
 *   and a tab still on a previous build needs that build's chunks, which the
 *   server no longer has. The last couple of builds' caches are kept for them
 *   (CR2-8).
 * - The versioned engine under `/engine/<version>/` (the Stockfish wasm is
 *   fetched when the AI page first starts the engine) lives in its own
 *   long-lived cache that survives deploys; only engine versions this build no
 *   longer ships are removed (CR-9).
 * - Page navigations are network-first with a cached fallback, cached by path
 *   only: every `/room?id=…` shares one entry (CR-9).
 * - Cross-origin traffic (the multiplayer API / WebSocket) is never touched:
 *   multiplayer needs the network anyway.
 */
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';
import { self as sw } from '$app/service-worker';
import {
	ENGINE_CACHE,
	appCacheName,
	engineDirs,
	isStaleEngine,
	navigationCacheKey,
	staleCaches
} from '$lib/serviceWorkerCache';

const CACHE = appCacheName(version);

// Manifest paths are relative to the base path (none here); normalise to "/…".
const abs = ({ path }: { path: string }) => `/${path.replace(/^\//, '')}`;

const ASSETS = assets.map(abs);
const ENGINE_DIRS = engineDirs(ASSETS);

const PRECACHE = [
	...immutable.map(abs).filter((path) => !path.endsWith('.wasm')),
	...ASSETS.filter((path) => !path.startsWith('/imgs/screenshot') && !path.startsWith('/engine/')),
	...prerendered.map(abs)
];
const PRECACHED = new Set(PRECACHE);

async function precache() {
	const cache = await caches.open(CACHE);
	const results = await Promise.allSettled(PRECACHE.map((path) => cache.add(path)));
	const failed = PRECACHE.filter((_, i) => results[i].status === 'rejected');
	if (failed.length > 0) {
		// Not fatal: anything missing is fetched (and cached) on first use instead.
		console.warn(`Service worker: ${failed.length} file(s) not precached`, failed);
	}
}

async function pruneEngineCache() {
	const cache = await caches.open(ENGINE_CACHE);
	const requests = await cache.keys();
	await Promise.all(
		requests
			.filter((request) => isStaleEngine(new URL(request.url).pathname, ENGINE_DIRS))
			.map((request) => cache.delete(request))
	);
}

sw.addEventListener('install', (event) => {
	event.waitUntil(precache().then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(staleCaches(keys, CACHE).map((key) => caches.delete(key))))
			.then(pruneEngineCache)
			.then(() => sw.clients.claim())
	);
});

async function cacheFirst(
	request: Request,
	cacheName = CACHE,
	{ anyCache = false } = {}
): Promise<Response> {
	const cache = await caches.open(cacheName);
	const cached = (await cache.match(request)) ?? (anyCache ? await caches.match(request) : null);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) cache.put(request, response.clone());
	return response;
}

async function networkFirstPage(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const key = navigationCacheKey(new URL(request.url));
	try {
		const response = await fetch(request);
		if (response.ok && response.type === 'basic') cache.put(key, response.clone());
		return response;
	} catch (error) {
		const cached = (await cache.match(key)) ?? (await cache.match('/'));
		if (cached) return cached;
		throw error;
	}
}

async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (response.ok && response.type === 'basic') cache.put(request, response.clone());
		return response;
	} catch (error) {
		const cached = await cache.match(request, { ignoreSearch: true });
		if (cached) return cached;
		throw error;
	}
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (url.pathname.startsWith('/engine/')) {
		event.respondWith(cacheFirst(request, ENGINE_CACHE));
	} else if (PRECACHED.has(url.pathname) && request.mode !== 'navigate') {
		event.respondWith(cacheFirst(request));
	} else if (url.pathname.startsWith('/_app/immutable/')) {
		// Not in this build: maybe a previous build's chunk, for a tab still on it.
		event.respondWith(cacheFirst(request, CACHE, { anyCache: true }));
	} else if (request.mode === 'navigate') {
		event.respondWith(networkFirstPage(request));
	} else {
		event.respondWith(networkFirst(request));
	}
});
