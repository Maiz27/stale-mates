import { expect, test } from '@playwright/test';

test.describe('home', () => {
	test('desktop: the Play AI dialog starts a game', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await page.getByRole('button', { name: 'Play AI: Adaptive Challenge' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByRole('button', { name: 'Start Game' }).click();
		await expect(page).toHaveURL(/\/ai$/);
	});

	test('mobile: the Play AI drawer starts a game', async ({ browser }) => {
		const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await context.newPage();
		try {
			await page.goto('/');
			await page.getByRole('button', { name: 'Play AI: Adaptive Challenge' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await page.getByRole('button', { name: 'Start Game' }).click();
			await expect(page).toHaveURL(/\/ai$/);
		} finally {
			await context.close();
		}
	});

	test('theme menu switches the board colours', async ({ page }) => {
		await page.goto('/ai');
		await page.getByRole('button', { name: 'Toggle theme' }).click();
		await page.getByRole('menuitemradio', { name: 'Green' }).click();
		await expect(page.locator('[data-board-theme="green"]')).toBeVisible();
		await page.reload();
		await expect(page.locator('[data-board-theme="green"]')).toBeVisible();
	});
});
