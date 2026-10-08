import { expect, test, type Page } from '@playwright/test';
import { boardLocator, clickMove } from './helpers/board';

/**
 * Multiplayer mode (`/room?id=…#seat=<token>`) needs the API server on :3000.
 * The Playwright config starts it and builds the frontend with VITE_API_URL /
 * VITE_API_WS_URL pointing at it (defaults, unless already exported), so this
 * runs on a clean checkout with no .env. Each test creates its room through the
 * API first; only if the API itself is unreachable (it failed to build or
 * start, e.g. against a reused external preview server) does a test skip. A
 * frontend that can't reach a running API fails the test.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

/**
 * POST /game/create -> { id }. Returns null ONLY when the API is unreachable
 * (so the test skips rather than failing on a missing server). A reachable
 * server that responds badly is a real regression and is thrown, failing the test.
 */
type Room = { id: string; white: string; black: string };

async function createRoom(page: Page, time = 0): Promise<Room | null> {
	let res;
	try {
		res = await page.request.post(`${API_URL}/game/create`, {
			data: { time, color: 'white' },
			timeout: 5_000
		});
	} catch {
		// Connection error — server not running. Caller skips.
		return null;
	}
	if (!res.ok()) {
		throw new Error(`POST /game/create failed: ${res.status()} ${res.statusText()}`);
	}
	const body = (await res.json()) as {
		id?: string;
		you?: { color: string; token: string };
		invite?: { color: string; token: string };
	};
	if (!body.id || !body.you || !body.invite) {
		throw new Error('POST /game/create returned no room id / seats');
	}
	// The creator asked for white, so the invite seat is black.
	return { id: body.id, white: body.you.token, black: body.invite.token };
}

/** Invite-style link: the seat token rides in the URL fragment. */
const seatUrl = (room: Room, color: 'white' | 'black') =>
	`/room?id=${room.id}#seat=${color === 'white' ? room.white : room.black}`;

test.describe('Multiplayer mode', () => {
	test('white move propagates to black', async ({ browser, page }) => {
		const room = await createRoom(page);
		test.skip(
			room === null,
			'API server at ' +
				API_URL +
				' not reachable. ' +
				'Multiplayer requires the api/ server on :3000 with ORIGIN allowing the preview origin.'
		);

		// Two isolated browser contexts: white and black join the same room.
		const whiteCtx = await browser.newContext();
		const blackCtx = await browser.newContext();
		const white = await whiteCtx.newPage();
		const black = await blackCtx.newPage();

		try {
			await white.goto(seatUrl(room!, 'white'));
			await black.goto(seatUrl(room!, 'black'));

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

			// Reconnect: reloading keeps the seat and the move list (SM-1.5) and the
			// opponent sees the disconnect/reconnect (SM-1.6).
			await black.reload();
			await expect(black.getByRole('list').getByText('e4', { exact: true })).toBeVisible({
				timeout: 15_000
			});
			await expect(white.getByText('Opponent disconnected')).toHaveCount(0, { timeout: 15_000 });

			// Black can still move after reconnecting.
			await clickMove(black, 'e7', 'e5', 'black');
			await expect(white.getByRole('list').getByText('e5', { exact: true })).toBeVisible({
				timeout: 15_000
			});
		} finally {
			await whiteCtx.close();
			await blackCtx.close();
		}
	});

	test('an unknown room shows a not-found state instead of a dead end', async ({ page }) => {
		const probe = await createRoom(page);
		test.skip(probe === null, 'API server not reachable');
		await page.goto('/room?id=does-not-exist&color=white');
		await expect(page.getByText('This invite link is incomplete')).toBeVisible({ timeout: 15_000 });

		await page.goto('/room?id=does-not-exist#seat=abcdefghijklmnop');
		await expect(page.getByText('Room not found or full')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole('button', { name: 'Back to Home' })).toBeVisible();
	});

	test('joining after the creator left shows them as disconnected, with the full grace (CR-3)', async ({
		browser,
		page
	}) => {
		const room = await createRoom(page);
		test.skip(room === null, 'API server not reachable');
		const a = await browser.newContext();
		const b = await browser.newContext();
		try {
			const creator = await a.newPage();
			await creator.goto(seatUrl(room!, 'white'));
			await expect(creator.getByText('Waiting for opponent to join…')).toBeVisible({
				timeout: 15_000
			});
			await creator.close();
			// The creator has been gone a while before the friend joins...
			await page.waitForTimeout(8_000);

			const friend = await b.newPage();
			await friend.goto(seatUrl(room!, 'black'));
			await expect(boardLocator(friend)).toBeVisible({ timeout: 20_000 });
			await expect(friend.getByText('Opponent disconnected')).toBeVisible({ timeout: 15_000 });
			// ...but the joiner still waits the full grace (60 s), counted from the
			// start of the game, not from the creator's disconnect (CR2-3).
			const countdown = friend.getByText(/You can claim the win in \d+s/);
			await expect(countdown).toBeVisible();
			const seconds = Number((await countdown.innerText()).match(/in (\d+)s/)![1]);
			expect(seconds).toBeGreaterThan(56);
		} finally {
			await a.close();
			await b.close();
		}
	});

	test('a used invite link cannot take over the seat from another browser', async ({
		browser,
		page
	}) => {
		const room = await createRoom(page);
		test.skip(room === null, 'API server not reachable');
		const a = await browser.newContext();
		const b = await browser.newContext();
		try {
			const black = await a.newPage();
			await black.goto(seatUrl(room!, 'black'));
			await expect(black.getByText('You are playing as')).toContainText('black', {
				timeout: 15_000
			});

			// Someone else (another browser) opens the same, now spent, invite link.
			const intruder = await b.newPage();
			await intruder.goto(seatUrl(room!, 'black'));
			await expect(intruder.getByText('Room not found or full')).toBeVisible({ timeout: 15_000 });
		} finally {
			await a.close();
			await b.close();
		}
	});

	test('the seat survives closing the tab and is resumed in the same browser (CR-5)', async ({
		browser,
		page
	}) => {
		const room = await createRoom(page);
		test.skip(room === null, 'API server not reachable');
		const a = await browser.newContext();
		const b = await browser.newContext();
		try {
			const white = await b.newPage();
			await white.goto(seatUrl(room!, 'white'));
			const black = await a.newPage();
			await black.goto(seatUrl(room!, 'black'));
			await expect(boardLocator(black)).toBeVisible({ timeout: 20_000 });
			await clickMove(white, 'e2', 'e4', 'white');
			await expect(black.getByRole('list').getByText('e4', { exact: true })).toBeVisible({
				timeout: 15_000
			});

			// Close the tab, then reopen the bare room URL (no #seat): the seat comes back.
			await black.close();
			const reopened = await a.newPage();
			await reopened.goto(`/room?id=${room!.id}`);
			await expect(reopened.getByText('You are playing as')).toContainText('black', {
				timeout: 15_000
			});
			await expect(reopened.getByRole('list').getByText('e4', { exact: true })).toBeVisible();

			// Reopening the (spent) invite link in the same browser also resumes the
			// seat; the older tab is told the game moved.
			const viaInvite = await a.newPage();
			await viaInvite.goto(seatUrl(room!, 'black'));
			await expect(viaInvite.getByText('You are playing as')).toContainText('black', {
				timeout: 15_000
			});
			await expect(reopened.getByText('This game is open somewhere else')).toBeVisible({
				timeout: 15_000
			});

			// The creator opening the invite link meant for the friend resumes their own seat.
			const creatorViaInvite = await b.newPage();
			await creatorViaInvite.goto(seatUrl(room!, 'black'));
			await expect(creatorViaInvite.getByText('You are playing as')).toContainText('white', {
				timeout: 15_000
			});
		} finally {
			await a.close();
			await b.close();
		}
	});

	test('joining a room keeps the saved AI game and settings (CR2-1)', async ({ page }) => {
		const room = await createRoom(page);
		test.skip(room === null, 'API server not reachable');
		// A saved AI game and a preference, both under the shared `stalemates:` prefix.
		await page.goto('/ai');
		await page.getByRole('button', { name: 'Start New Game' }).click();
		await expect(page.locator('cg-board piece')).toHaveCount(32);
		await clickMove(page, 'e2', 'e4', 'white');
		const list = page
			.locator('div')
			.filter({ has: page.getByRole('heading', { name: 'Moves' }) })
			.getByRole('list');
		await expect(list.getByText('e4', { exact: true })).toBeVisible();
		await page.evaluate(() => localStorage.setItem('stalemates:sound', 'off'));

		// Joining stores a seat (and sweeps expired seats).
		await page.goto(seatUrl(room!, 'black'));
		await expect(page.getByText('You are playing as')).toContainText('black', {
			timeout: 15_000
		});

		expect(await page.evaluate(() => localStorage.getItem('stalemates:sound'))).toBe('off');
		await page.goto('/ai');
		await expect(list.getByText('e4', { exact: true })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole('button', { name: 'Start New Game' })).toHaveCount(0);
	});

	test('creating a game from home goes straight to the waiting room with an invite link', async ({
		page
	}) => {
		const probe = await createRoom(page);
		test.skip(probe === null, 'API server not reachable');
		await page.goto('/');
		await page.getByRole('button', { name: 'Play Friend: Friendly Duel' }).click();
		await page.getByRole('button', { name: 'Create Game' }).click();
		await expect(page).toHaveURL(/\/room\?id=/);
		await expect(page.getByText('Waiting for opponent to join…')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByLabel('Invite link', { exact: true })).toHaveValue(
			/\/room\?id=.+#seat=/
		);
	});

	test('draw offer, accept, and a colour-swapping rematch', async ({ browser, page }) => {
		const room = await createRoom(page);
		test.skip(room === null, 'API server not reachable');
		const a = await browser.newContext();
		const b = await browser.newContext();
		try {
			const white = await a.newPage();
			const black = await b.newPage();
			await white.goto(seatUrl(room!, 'white'));
			await black.goto(seatUrl(room!, 'black'));
			await expect(boardLocator(white)).toBeVisible({ timeout: 20_000 });
			await expect(boardLocator(black)).toBeVisible({ timeout: 20_000 });

			await white.getByRole('button', { name: /Offer draw/ }).click();
			await expect(white.getByRole('button', { name: 'Draw offered' })).toBeVisible();
			await expect(black.getByText('Your opponent offers a draw.')).toBeVisible();
			await black.getByRole('button', { name: 'Accept', exact: true }).click();
			await expect(white.getByText('Game Over: Draw by agreement')).toBeVisible();
			await expect(black.getByText('Game Over: Draw by agreement')).toBeVisible();

			await white.getByRole('button', { name: 'Offer Rematch' }).click();
			await black.getByRole('button', { name: 'Accept Rematch' }).click();
			// Colours swap: the former black player is now white.
			await expect(black.getByText('You are playing as')).toContainText('white');
			await expect(white.getByText('You are playing as')).toContainText('black');
		} finally {
			await a.close();
			await b.close();
		}
	});

	test('a running clock does not wipe arrows drawn on the board', async ({ browser, page }) => {
		const room = await createRoom(page, 3);
		test.skip(room === null, 'API server not reachable');
		const a = await browser.newContext();
		const b = await browser.newContext();
		try {
			const white = await a.newPage();
			const black = await b.newPage();
			await white.goto(seatUrl(room!, 'white'));
			await black.goto(seatUrl(room!, 'black'));
			await expect(boardLocator(white)).toBeVisible({ timeout: 20_000 });

			// Right-drag e2 -> e4 draws a user arrow.
			const box = (await white.locator('.cg-wrap').boundingBox())!;
			const sq = box.width / 8;
			const at = (file: number, rank: number) => ({
				x: box.x + file * sq + sq / 2,
				y: box.y + (7 - rank) * sq + sq / 2
			});
			const from = at(4, 1);
			const to = at(4, 3);
			await white.mouse.move(from.x, from.y);
			await white.mouse.down({ button: 'right' });
			await white.mouse.move(to.x, to.y, { steps: 5 });
			await white.mouse.up({ button: 'right' });
			const arrows = white.locator('.cg-shapes line, .cg-shapes path');
			await expect(arrows.first()).toBeAttached();

			// Several clock ticks later the arrow is still there.
			await white.waitForTimeout(1500);
			await expect(arrows.first()).toBeAttached();
		} finally {
			await a.close();
			await b.close();
		}
	});
});
