import { expect, test } from '@playwright/test';
import { boardLocator, clickMove } from './helpers/board';

/**
 * AI mode (`/ai`) is fully client-side: it runs an in-browser Stockfish worker,
 * so it needs no backend. That makes it the most reliable e2e target.
 *
 * Flow under test: load the page -> "Start New Game" -> board becomes
 * interactive -> human (white) plays e2-e4 -> the move registers in the SAN
 * move list and the AI replies as black.
 */

test.describe('AI mode', () => {
	test('page loads with the start control and move list', async ({ page }) => {
		await page.goto('/ai');

		await expect(page.getByRole('heading', { name: /Play AI/i })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Start New Game' })).toBeVisible();

		// Move list is present and empty before a game starts.
		await expect(page.getByRole('heading', { name: 'Moves' })).toBeVisible();
		await expect(page.getByText('No moves yet.')).toBeVisible();
	});

	test('starting a game makes the board interactive', async ({ page }) => {
		await page.goto('/ai');

		await page.getByRole('button', { name: 'Start New Game' }).click();

		// Once started the "Start New Game" button is replaced by in-game controls.
		await expect(page.getByRole('button', { name: 'Start New Game' })).toHaveCount(0);

		// The board renders with the initial 32 pieces.
		await expect(boardLocator(page)).toBeVisible();
		await expect(page.locator('cg-board piece')).toHaveCount(32);
	});

	test('human can make an opening move and the AI replies', async ({ page }) => {
		await page.goto('/ai');
		await page.getByRole('button', { name: 'Start New Game' }).click();

		await expect(boardLocator(page)).toBeVisible();
		await expect(page.locator('cg-board piece')).toHaveCount(32);

		// Play e2-e4 as white (default player colour, white orientation).
		await clickMove(page, 'e2', 'e4', 'white');

		// White's move appears in the SAN move list. The first white move of a
		// king-pawn opening is "e4". Scope the list to the Moves panel so an
		// unrelated list elsewhere on the page can't make this ambiguous.
		const movesPanel = page
			.locator('div')
			.filter({ has: page.getByRole('heading', { name: 'Moves' }) });
		const moveList = movesPanel.getByRole('list');
		await expect(moveList.getByText('e4', { exact: true })).toBeVisible();

		// The Stockfish worker replies as black: a second half-move is rendered
		// in the list alongside white's e4. Wait generously — engine init +
		// search can take a moment on first run.
		await expect
			.poll(
				async () => {
					const text = (await moveList.innerText()).trim();
					// e.g. "1.\te4\te5" — at least two SAN tokens after the move number.
					const tokens = text
						.replace(/No moves yet\./, '')
						.split(/\s+/)
						.filter((t) => t && !/^\d+\.$/.test(t));
					return tokens.length;
				},
				{ timeout: 30_000 }
			)
			.toBeGreaterThanOrEqual(2);
	});

	test('resigning asks for confirmation, then offers play again / swap colours', async ({
		page
	}) => {
		await page.goto('/ai');
		await page.getByRole('button', { name: 'Start New Game' }).click();
		await page.getByRole('button', { name: 'Resign game' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();

		await expect(page.getByText('Game Over: Black wins by resignation')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
		await page.getByRole('button', { name: 'Swap colors' }).click();
		await expect(page.getByText('Player: Black')).toBeVisible();
	});

	test('an in-progress game survives a reload', async ({ page }) => {
		await page.goto('/ai');
		await page.getByRole('button', { name: 'Start New Game' }).click();
		await expect(page.locator('cg-board piece')).toHaveCount(32);
		await clickMove(page, 'e2', 'e4', 'white');
		const list = page
			.locator('div')
			.filter({ has: page.getByRole('heading', { name: 'Moves' }) })
			.getByRole('list');
		await expect(list.getByText('e4', { exact: true })).toBeVisible();

		await page.reload();
		await expect(list.getByText('e4', { exact: true })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole('button', { name: 'Start New Game' })).toHaveCount(0);
	});

	test('works offline once visited (service worker)', async ({ page, context }) => {
		await page.goto('/ai');
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});
		// Reload while controlled so the engine (wasm) is fetched through the SW and cached.
		await page.reload();
		await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
		// Wait until the engine's wasm has been runtime-cached by the service worker.
		await expect
			.poll(
				() =>
					page.evaluate(async () => {
						for (const key of await caches.keys()) {
							const requests = await (await caches.open(key)).keys();
							if (requests.some((r) => r.url.endsWith('.wasm'))) return true;
						}
						return false;
					}),
				{ timeout: 30_000 }
			)
			.toBe(true);

		await context.setOffline(true);
		try {
			await page.reload();
			await page.getByRole('button', { name: 'Start New Game' }).click();
			await expect(page.locator('cg-board piece')).toHaveCount(32);
			await clickMove(page, 'e2', 'e4', 'white');
			const list = page
				.locator('div')
				.filter({ has: page.getByRole('heading', { name: 'Moves' }) })
				.getByRole('list');
			// The engine replies with no network.
			await expect
				.poll(
					async () =>
						(await list.innerText()).split(/\s+/).filter((t) => t && !/^\d+\.$/.test(t)).length,
					{
						timeout: 30_000
					}
				)
				.toBeGreaterThanOrEqual(2);
		} finally {
			await context.setOffline(false);
		}
	});

	test('an engine that fails to load shows an error and can be retried (CR-10)', async ({
		page
	}) => {
		await page.route('**/engine/**', (route) => route.abort());
		await page.goto('/ai');
		await expect(page.getByText('Engine failed to load.')).toBeVisible({ timeout: 15_000 });

		await page.unroute('**/engine/**');
		await page.getByRole('button', { name: 'Retry' }).click();
		await expect(page.getByText('Engine failed to load.')).toHaveCount(0);

		await page.getByRole('button', { name: 'Start New Game' }).click();
		await clickMove(page, 'e2', 'e4', 'white');
		const list = page
			.locator('div')
			.filter({ has: page.getByRole('heading', { name: 'Moves' }) })
			.getByRole('list');
		await expect
			.poll(
				async () =>
					(await list.innerText()).split(/\s+/).filter((t) => t && !/^\d+\.$/.test(t)).length,
				{ timeout: 30_000 }
			)
			.toBeGreaterThanOrEqual(2);
	});

	test('a move can be typed instead of dragged', async ({ page }) => {
		await page.goto('/ai');
		await page.getByRole('button', { name: 'Start New Game' }).click();
		const input = page.getByLabel('Type a move:');
		await input.fill('e5');
		await input.press('Enter');
		await expect(page.getByText('e5 is not a legal move here.')).toBeVisible();
		await input.fill('Nf3');
		await input.press('Enter');
		const list = page
			.locator('div')
			.filter({ has: page.getByRole('heading', { name: 'Moves' }) })
			.getByRole('list');
		await expect(list.getByText('Nf3', { exact: true })).toBeVisible();
	});

	test('the engine worker reports WASM download progress (CR2-6)', async ({ page }) => {
		// The engine's load watchdog is re-armed by these reports, so a slow but
		// moving download isn't mistaken for a failure. Guard the Stockfish.js hook.
		await page.goto('/ai');
		// Keep in sync with STOCKFISH_URL (src/lib/engine/Stockfish.ts).
		const engineUrl = '/engine/stockfish-18.0.8/stockfish-18-lite-single.js';
		const reports = await page.evaluate(async (url) => {
			const worker = new Worker(url);
			const channel = new MessageChannel();
			const seen: { loaded: number; total: number; percent: number }[] = [];
			// Resolves on the final report (or after 20 s, failing the assertions below).
			await new Promise<void>((resolve) => {
				const timer = setTimeout(resolve, 20_000);
				channel.port1.onmessage = (event) => {
					seen.push(event.data);
					if (event.data.percent >= 1) {
						clearTimeout(timer);
						resolve();
					}
				};
				worker.postMessage({ progressPort: channel.port2 }, [channel.port2]);
				worker.postMessage('uci');
			});
			worker.terminate();
			return seen;
		}, engineUrl);
		expect(reports.length).toBeGreaterThan(0);
		expect(reports.at(-1)).toMatchObject({ loaded: reports.at(-1)!.total });
	});
});
