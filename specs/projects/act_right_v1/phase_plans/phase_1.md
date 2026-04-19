---
status: complete
---

# Phase 1: Repo Foundation

## Overview

Set up the repository skeleton: package.json (private, devDeps only), TypeScript config, linting, formatting, CI, license, and minimal README. No runtime code or shipped artifacts -- just the development infrastructure that all subsequent phases build on.

## Steps

1. Create `package.json` with `"private": true`, `engines.node >= 20`, devDependencies (typescript ^5, tsx ^4, vitest ^2, @playwright/test latest, @types/node, eslint, @typescript-eslint/parser, @typescript-eslint/eslint-plugin, prettier), and scripts (`test`, `lint`, `format`). No `bin`, no `publishConfig`, no `main`/`exports`.

2. Create `tsconfig.json` targeting ES2022/NodeNext for the helper scripts. Include `scripts/` and `tests/`.

3. Update `.gitignore` to add `node_modules/`, `test-results/`, `.vitest/`, `dist/` (prevent accidental creation).

4. Create ESLint flat config (`eslint.config.mjs`) using @typescript-eslint recommended preset, scoped to `scripts/**/*.ts` and `tests/**/*.ts`.

5. Create `.prettierrc` with minimal settings (no trailing commas in JSON, single quotes or defaults).

6. Create `LICENSE` (MIT, copyright 2026 scosman).

7. Create `README.md` -- 1-2 paragraphs explaining what ActRight is; note that full docs come in Phase 5.

8. Create `.github/workflows/ci.yml` running lint + test on push/PR, Node 20.

9. Create `scripts/` directory with a `.gitkeep` so the lint glob has something to match.

10. Create `tests/scripts/` directory with a `.gitkeep`.

11. Run `npm install` to generate lockfile.

12. Verify `npm test`, `npm run lint`, and `npm run format -- --check` all exit 0.

## Tests

- No new tests in this phase (test infrastructure only; actual tests come in Phase 2).
- `npm test` must exit 0 with vitest finding no test files.
- `npm run lint` must exit 0 with no errors.
- `npm run format -- --check` must exit 0.
