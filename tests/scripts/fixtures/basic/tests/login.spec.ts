import { test, expect } from '@playwright/test';

/* @act
## Goals
User with valid credentials signs in and lands on the dashboard.

## Fixtures
- seed_user(alice@example.com, correct-horse)

## Hints
- Sign-in button is in the header.

## Assertions
- URL is /dashboard.
- Dashboard heading says "Welcome, Alice".
*/
test('valid credentials', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/dashboard');
});

/* @act
## Goals
Verify that expired sessions redirect to login.
*/
test.skip('expired session redirect', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/login');
});
