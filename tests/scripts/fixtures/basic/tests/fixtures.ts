import { test as base } from '@playwright/test';

/** Creates a signed-up user */
export const test = base.extend<{ signedUp: void; loggedIn: void }>({
  signedUp: async ({}, use) => {
    // seed a user
    await use();
  },

  /** Creates a user and logs in. Depends on signedUp. */
  loggedIn: async ({ signedUp }, use) => {
    // log in as the seeded user
    await use();
  },
});
