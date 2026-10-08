import { describe, it, expect } from 'vitest';
import {
	ENGINE_CACHE,
	engineDirs,
	isStaleEngine,
	navigationCacheKey,
	staleCaches,
	PREVIOUS_BUILDS_KEPT
} from './serviceWorkerCache';

describe('service worker cache policy (CR-9)', () => {
	it('keys every navigation by path, so /room?id=… is cached once', () => {
		expect(navigationCacheKey(new URL('https://x.test/room?id=abc'))).toBe('/room');
		expect(navigationCacheKey(new URL('https://x.test/room?id=def#seat=1'))).toBe('/room');
		expect(navigationCacheKey(new URL('https://x.test/'))).toBe('/');
	});

	it('keeps the engine cache across deploys; drops unrelated caches', () => {
		expect(
			staleCaches(['stalemates-v1', 'stalemates-v2', ENGINE_CACHE, 'other'], 'stalemates-v2')
		).toEqual(['other']);
	});

	it('keeps the previous builds an open tab may still need; drops older ones (CR2-8)', () => {
		// caches.keys() lists caches in creation order, oldest first.
		const keys = ['stalemates-v1', 'stalemates-v2', ENGINE_CACHE, 'stalemates-v3', 'stalemates-v4'];
		expect(staleCaches(keys, 'stalemates-v4')).toEqual(['stalemates-v1']);
		expect(staleCaches(keys, 'stalemates-v4', 1)).toEqual(['stalemates-v1', 'stalemates-v2']);
		expect(PREVIOUS_BUILDS_KEPT).toBe(2);
	});

	it('finds the shipped engine versions and flags only older ones as stale', () => {
		const current = engineDirs([
			'/engine/stockfish-18.0.8/stockfish-18-lite-single.js',
			'/engine/stockfish-18.0.8/stockfish-18-lite-single.wasm',
			'/imgs/logo.png'
		]);
		expect([...current]).toEqual(['/engine/stockfish-18.0.8/']);
		expect(isStaleEngine('/engine/stockfish-18.0.8/stockfish-18-lite-single.wasm', current)).toBe(
			false
		);
		expect(isStaleEngine('/engine/stockfish-17.1.0/sf.wasm', current)).toBe(true);
	});
});
