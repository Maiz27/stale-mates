import { describe, it, expect } from 'vitest';
import {
	ENGINE_CACHE,
	engineDirs,
	isStaleEngine,
	navigationCacheKey,
	staleCaches
} from './serviceWorkerCache';

describe('service worker cache policy (CR-9)', () => {
	it('keys every navigation by path, so /room?id=… is cached once', () => {
		expect(navigationCacheKey(new URL('https://x.test/room?id=abc'))).toBe('/room');
		expect(navigationCacheKey(new URL('https://x.test/room?id=def#seat=1'))).toBe('/room');
		expect(navigationCacheKey(new URL('https://x.test/'))).toBe('/');
	});

	it('keeps the engine cache across deploys; drops other old app caches', () => {
		expect(
			staleCaches(['stalemates-v1', 'stalemates-v2', ENGINE_CACHE, 'other'], 'stalemates-v2')
		).toEqual(['stalemates-v1', 'other']);
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
