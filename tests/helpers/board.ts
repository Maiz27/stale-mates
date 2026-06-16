import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Helpers for driving a chessground board in e2e tests.
 *
 * chessground renders squares and pieces inside `cg-board`, positioned by inline
 * CSS `transform: translate(...)`, and — crucially — pieces have
 * `pointer-events: none`. chessground listens for pointer events on the
 * `cg-board` element itself and resolves which square was hit from the pointer
 * coordinates. So we cannot click a piece/square *element*; we must click at the
 * right pixel inside the board. We compute the pixel centre of an algebraic
 * square from the board's rendered bounding box and orientation, then use
 * `page.mouse` to click there. This drives a real click-to-move interaction:
 * click the origin square (selects the piece, revealing `move-dest` squares),
 * then click the destination square.
 *
 * The board can render larger than a default viewport, so tests that drive moves
 * should use a tall viewport (configured in playwright.config.ts) to keep the
 * whole board on-screen.
 */

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export type Orientation = 'white' | 'black';

/** The chessground board element (used for move-dest / piece queries). */
export function boardLocator(page: Page): Locator {
	return page.locator('cg-board');
}

/**
 * The `.cg-wrap` container is the element whose bounding box matches the actual
 * rendered 8x8 grid (the inner `cg-board` reports a misleading, un-scaled box).
 * Use this for all coordinate math.
 */
function boardWrap(page: Page): Locator {
	return page.locator('.cg-wrap');
}

/**
 * Wait until the board's bounding box stops changing. chessground redraws/resizes
 * shortly after mount (a ResizeObserver settles the grid to its final size), so a
 * box read too early can be wrong. Poll until two consecutive reads match.
 */
async function waitForStableBox(board: Locator): Promise<void> {
	let prev = '';
	for (let i = 0; i < 20; i++) {
		const box = await board.boundingBox();
		const key = box ? `${Math.round(box.width)}x${Math.round(box.height)}@${Math.round(box.x)},${Math.round(box.y)}` : '';
		if (key && key === prev) return;
		prev = key;
		await board.page().waitForTimeout(100);
	}
}

/**
 * Pixel centre (viewport coords) of an algebraic square (e.g. "e2") on the
 * rendered board, accounting for orientation. From white's view a1 is the
 * bottom-left; from black's view it is the top-right.
 */
async function squareCenter(
	board: Locator,
	square: string,
	orientation: Orientation
): Promise<{ x: number; y: number }> {
	const box = await board.boundingBox();
	if (!box) throw new Error('Board has no bounding box (not rendered?)');

	const file = FILES.indexOf(square[0] as (typeof FILES)[number]); // 0..7, a..h
	const rank = Number(square[1]) - 1; // 0..7, 1..8
	if (file < 0 || rank < 0 || rank > 7) throw new Error(`Invalid square: ${square}`);

	const sq = box.width / 8;
	const col = orientation === 'white' ? file : 7 - file;
	const rowFromTop = orientation === 'white' ? 7 - rank : rank;

	return {
		x: box.x + col * sq + sq / 2,
		y: box.y + rowFromTop * sq + sq / 2
	};
}

/**
 * Make a move by clicking the origin square then the destination square
 * (chessground click-to-move). Assumes it is the human's turn and the move is
 * legal, so the origin piece is selectable.
 */
export async function clickMove(
	page: Page,
	from: string,
	to: string,
	orientation: Orientation = 'white'
): Promise<void> {
	const wrap = boardWrap(page);
	await expect(wrap).toBeVisible();
	// Make sure the board is scrolled into view so mouse coordinates land on it,
	// and let its size settle before reading geometry.
	await wrap.scrollIntoViewIfNeeded();
	await waitForStableBox(wrap);

	const origin = await squareCenter(wrap, from, orientation);
	await page.mouse.click(origin.x, origin.y);

	// chessground marks legal destinations as `square.move-dest` once a piece is
	// selected — wait for that so we don't click before selection registers.
	await expect(page.locator('cg-board square.move-dest').first()).toBeAttached();

	const dest = await squareCenter(wrap, to, orientation);
	await page.mouse.click(dest.x, dest.y);
}
