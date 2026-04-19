import { test, expect } from '@playwright/test';

/* @act
## Goals
App loads successfully.
*/
test('app loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
