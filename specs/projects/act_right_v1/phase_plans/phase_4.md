---
status: complete
---

# Phase 4: Mode References + Example Test

## Overview

Write the three mode reference files (`setup.md`, `new.md`, `heal.md`) that the SKILL.md router dispatches to, plus the install-verification example test (`examples/sanity.spec.ts`) used by `/act setup`, and a placeholder for the future `/act discover` mode.

These are markdown prose files (agent instructions), not executable code — except the single example test which is a valid Playwright spec.

## Steps

1. Write `references/setup.md` — the `/act setup` mode reference implementing the 9-step flow from functional spec §5.2 and architecture §5.1.
2. Write `references/new.md` — the `/act new` mode reference implementing the authoring flow from functional spec §5.3 and architecture §5.2.
3. Write `references/heal.md` — the `/act heal` mode reference implementing the triage/repair/report flow from functional spec §5.4–§5.5 and architecture §5.3.
4. Create `examples/` directory and write `examples/sanity.spec.ts` — the install-verification test using a `data:` URL.
5. Write `references/discover.md` — short v1+ placeholder per functional spec §5.6.

## Tests

- Tests-written=NA. Deliverables are markdown reference files and one example `.spec.ts` that is not run in CI (it requires a Playwright install; it is an example shipped with the skill, not a project test).
- Run `npm run lint`, `npm run format:check`, and `npm test` to verify no regressions.
