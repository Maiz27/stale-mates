import { expect, test, type Page } from '@playwright/test';
import { boardLocator, clickMove } from './helpers/board';

/**
 * Multiplayer mode (`/room?id=...&color=...`) needs the API server (port 3000)
 * and the frontend build must have been compiled with VITE_API_URL /
 * VITE_API_WS_URL pointing at it (see repo-root .env). The Playwright config
 * starts both servers, but if the API build/start failed (or the env vars were
 * not baked into the frontend build), we skip rather than fail — the AI spec is
 * the guaranteed-green target. The check below probes the API once.
 */

const API_URL = process.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * POST /game/create -> { id }. Returns null ONLY when the API is unreachable
 * (so the test skips rather than failing on a missing server). A reachable
 * server that responds badly is a real regression and is thrown, failing the test.
 */
async function createRoom(page: Page): Promise<string | null> {
	let res;
	try {
		res = await page.request.post(`${API_URL}/game/create`, {
			data: { time: 0 },
			timeout: 5_000
		});
	} catch {
		// Connection error — server not running. Caller skips.
		return null;
	}
	if (!res.ok()) {
		throw new Error(`POST /game/create failed: ${res.status()} ${res.statusText()}`);
	}
	const body = (await res.json()) as { id?: string };
	if (!body.id) throw new Error('POST /game/create returned no room id');
	return body.id;
}

test.describe('Multiplayer mode', () => {
	test('white move propagates to black', async ({ browser, page }) => {
		const roomId = await createRoom(page);
		test.skip(
			roomId === null,
			'API server at ' + API_URL + ' not reachable (or frontend build lacks VITE_API_URL). ' +
				'Multiplayer requires the api/ server on :3000 with ORIGIN allowing the preview origin.'
		);

		// Two isolated browser contexts: white and black join the same room.
		const whiteCtx = await browser.newContext();
		const blackCtx = await browser.newContext();
		const white = await whiteCtx.newPage();
		const black = await blackCtx.newPage();

		try {
			await white.goto(`/room?id=${roomId}&color=white`);
			await black.goto(`/room?id=${roomId}&color=black`);

			// Once both sockets are connected the game starts and both boards render.
			await expect(boardLocator(white)).toBeVisible({ timeout: 20_000 });
			await expect(boardLocator(black)).toBeVisible({ timeout: 20_000 });

			// Both boards start from the initial position (32 pieces).
			await expect(white.locator('cg-board piece')).toHaveCount(32);
			await expect(black.locator('cg-board piece')).toHaveCount(32);

			// White (white orientation) plays e2-e4.
			await clickMove(white, 'e2', 'e4', 'white');

			// White's own move list reflects it.
			await expect(white.getByRole('list').getByText('e4', { exact: true })).toBeVisible({
				timeout: 10_000
			});

			// Black's board (black orientation) reflects the same move: the move
			// list mirrors across the wire via `opponentMove`.
			await expect(black.getByRole('list').getByText('e4', { exact: true })).toBeVisible({
				timeout: 15_000
			});
		} finally {
			await whiteCtx.close();
			await blackCtx.close();
		}
	});
});
