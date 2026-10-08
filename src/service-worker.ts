/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * Offline support (audit SM-6), modest scope: AI mode works offline once the
 * site has been visited online.
 *
 * - Precache the app shell: every build chunk (except the multi-MB engine
 *   `.wasm`), static files and the prerendered pages.
 * - Content-hashed `/_app/immutable/` files (including the Stockfish wasm,
 *   fetched when the AI page first starts the engine) are cached at runtime,
 *   cache-first — their URLs change whenever their contents do.
 * - Page navigations are network-first with a cached fallback.
 * - Cross-origin traffic (the multiplayer API / WebSocket) is never touched:
 *   multiplayer needs the network anyway.
 */
import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `stalemates-${version}`;

const PRECACHE = [
	...build.filter((path) => !path.endsWith('.wasm')),
	...files.filter((path) => !path.startsWith('/imgs/screenshot')),
	...prerendered
];
const PRECACHED = new Set(PRECACHE);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => sw.clients.claim())
	);
});

async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) cache.put(request, response.clone());
	return response;
}

async function networkFirst(request: Request, fallbackPath?: string): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (response.ok && response.type === 'basic') cache.put(request, response.clone());
		return response;
	} catch (error) {
		const cached =
			(await cache.match(request, { ignoreSearch: true })) ??
			(fallbackPath ? await cache.match(fallbackPath) : undefined);
		if (cached) return cached;
		throw error;
	}
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (PRECACHED.has(url.pathname) && request.mode !== 'navigate') {
		event.respondWith(cacheFirst(request));
	} else if (url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(cacheFirst(request));
	} else if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request, '/'));
	} else {
		event.respondWith(networkFirst(request));
	}
});
