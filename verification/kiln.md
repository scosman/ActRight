---
status: not-started
---

# Kiln Verification -- v1 Release Gate

ActRight v1 ships verified against Kiln (SvelteKit) as the reference target. This file tracks the verification checklist. Update as each step completes.

## Checklist

- [ ] **`/act setup` runs to completion against Kiln.**
  - [ ] Playwright installed (or pre-existing install detected and skipped).
  - [ ] Playwright MCP registered in `.mcp.json`.
  - [ ] `<testDir>/act_sanity.spec.ts` copied from `examples/sanity.spec.ts` and passes.
  - [ ] `webServer` command + `baseURL` written to `playwright.config.ts` using Kiln's dev command.
  - [ ] "App loads" sanity test authored and passes.
  - [ ] Core fixtures scaffolded (e.g. `logged_in` for Kiln's auth flow).

- [ ] **One real Kiln test authored via `/act new` and committed.**
  - [ ] Docstring drafted interactively with the user.
  - [ ] Agent explored the app via Playwright MCP and produced an action sequence + locators.
  - [ ] Agent generated a working test body.
  - [ ] Test runs green via `npx playwright test`.
  - [ ] Committed to the Kiln repo.

- [ ] **`/act heal` successfully heals at least one simulated UI drift on Kiln.**
  - [ ] A Kiln component's accessible name/role was changed to simulate drift.
  - [ ] The associated act test now fails via `npx playwright test`.
  - [ ] `/act heal` triaged the failure as drift (not a real bug).
  - [ ] Agent rewrote the broken test body.
  - [ ] The rewritten test re-runs green in isolation.
  - [ ] The heal report correctly classified the failure as "Healed".

## Notes

- Kiln is a SvelteKit app at https://github.com/kiln-ai/kiln (or wherever the current Kiln repo lives -- substitute as appropriate).
- Other framework targets (Next, Vite, Nuxt, etc.) are expected to work but are NOT part of v1's release gate.

## Release criterion

v1 ships when every checkbox above is checked, and the resulting tests + fix diffs have been reviewed by a human.
