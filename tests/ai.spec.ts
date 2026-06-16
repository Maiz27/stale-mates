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
		// king-pawn opening is "e4".
		const moveList = page.getByRole('list');
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
});
