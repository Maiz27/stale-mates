import { expect, test } from '@playwright/test';

test.describe('service worker (CR-9)', () => {
	test('caches the room shell once, not every /room?id=… URL', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});
		await page.reload();
		await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

		for (const id of ['room-one', 'room-two', 'room-three']) {
			await page.goto(`/room?id=${id}`);
			await expect(page.getByText('This invite link is incomplete')).toBeVisible();
		}

		const cachedUrls = await page.evaluate(async () => {
			const urls: string[] = [];
			for (const key of await caches.keys()) {
				for (const request of await (await caches.open(key)).keys()) urls.push(request.url);
			}
			return urls;
		});
		expect(cachedUrls.filter((url) => url.includes('?id='))).toEqual([]);
		expect(cachedUrls.some((url) => new URL(url).pathname === '/room')).toBe(true);
	});

	test('keeps the engine in its own long-lived cache', async ({ page }) => {
		await page.goto('/ai');
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});
		await page.reload();
		await expect
			.poll(
				() =>
					page.evaluate(async () => {
						const engine = await caches.open('stalemates-engine');
						return (await engine.keys()).some((r) => r.url.endsWith('.wasm'));
					}),
				{ timeout: 30_000 }
			)
			.toBe(true);
	});

	test('a tab still on the previous build can load its chunks after a deploy (CR2-8)', async ({
		page
	}) => {
		await page.goto('/');
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});
		await page.reload();
		await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

		// What a previous build leaves behind: its own app cache holding its
		// content-hashed chunks, which the server no longer has after the deploy.
		const chunk = '/_app/immutable/chunks/previous-build-chunk.js';
		const body = await page.evaluate(async (path) => {
			const previous = await caches.open('stalemates-0-previous-build');
			await previous.put(
				path,
				new Response('export const fromPreviousBuild = true;', {
					headers: { 'content-type': 'text/javascript' }
				})
			);
			const response = await fetch(path);
			return response.ok ? response.text() : `HTTP ${response.status}`;
		}, chunk);
		expect(body).toBe('export const fromPreviousBuild = true;');
	});
});
