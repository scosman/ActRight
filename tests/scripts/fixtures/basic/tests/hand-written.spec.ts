import { test, expect } from '@playwright/test';

test('hand-written sanity', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
