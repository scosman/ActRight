import { test, expect } from '@playwright/test';

/* @act
## Goals
This docstring is orphaned because of the blank line below.
*/

test('separated by blank line', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
