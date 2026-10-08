import { describe, it, expect, vi } from 'vitest';
import {
	ENGINE_CACHE,
	engineDirs,
	isStaleEngine,
	navigationCacheKey,
	staleCaches,
	PREVIOUS_BUILDS_KEPT,
	retainCacheWrite
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

describe('retainCacheWrite', () => {
	it('keeps the worker alive until the cache write lands', async () => {
		let finishPut!: () => void;
		const put = vi.fn(() => new Promise<void>((resolve) => (finishPut = resolve)));
		const kept: Promise<unknown>[] = [];
		const response = new Response('engine');

		retainCacheWrite((p) => kept.push(p), { put }, '/engine/x.wasm', response);

		expect(kept).toHaveLength(1);
		expect(put).toHaveBeenCalledWith('/engine/x.wasm', expect.any(Response));
		expect(response.bodyUsed).toBe(false);
		let settled = false;
		void kept[0].then(() => (settled = true));
		await Promise.resolve();
		expect(settled).toBe(false);
		finishPut();
		await kept[0];
		expect(settled).toBe(true);
	});

	it('swallows a failed write so the network response is unaffected', async () => {
		const put = vi.fn(() => Promise.reject(new Error('QuotaExceededError')));
		const kept: Promise<unknown>[] = [];

		retainCacheWrite((p) => kept.push(p), { put }, '/', new Response('page'));

		await expect(kept[0]).resolves.toBeUndefined();
	});
});
