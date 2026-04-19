---
status: draft
---

# Functional Spec: ActRight v1

## 1. Thesis & Boundary

**Thesis.** AI writes and heals tests. AI never runs them. The compiled test suite is pure Playwright Test code that executes deterministically with no LLM in the loop.

**ActRight is a layer on top of Playwright.** It is *not* a new test runner, a new browser driver, or a new fixture system. It generates and maintains Playwright Test files from plain-English descriptions, and repairs them when the UI drifts.

**What act owns**
- Markdown test descriptions (source of truth for intent)
- The compile pipeline (markdown → Playwright Test file) via an agent driving a browser through Playwright MCP
- The heal pipeline (triage failing tests → rewrite compiled tests for UI drift → re-run to confirm)
- User-facing skills (`/act:new`, `/act:heal`) for the agent loop
- An **act MCP server** that exposes project introspection tools to those skills (e.g. listing available fixtures)
- An installer (`act init`) that wires all of the above into a target project

**What act does NOT own — delegated to Playwright Test / Playwright MCP**
- Running the compiled tests (`npx playwright test`)
- Fixtures (Playwright Test fixtures — composition, lifecycle)
- Parallelism, retries, timeouts, workers (Playwright config)
- Browsers (Playwright owns; Chromium is the v1 default because it's what Playwright defaults to)
- `baseURL` and server lifecycle (Playwright's `webServer` config owns `command` / `url` / `reuseExistingServer`)
- Secrets/env (user's existing `.env` or Playwright's `use` hooks)
- Reporters beyond the default CLI output (Playwright has JSON, JUnit, HTML — surfaced via Playwright config, not an act surface)

Any time v1 is tempted to reinvent a Playwright concern, the answer is to back away and let Playwright do it.

## 2. v1 Scope

### 2.1 In scope

- `/act:new` — interactive skill: user describes a test in English; agent drafts markdown, confirms with user, compiles to Playwright Test via Playwright MCP, verifies the compiled test runs green, commits.
- `/act:heal` — mostly non-interactive skill: runs the compiled suite, triages failures, rewrites compiled tests for UI drift, re-runs to confirm, and produces a final report.
- **act MCP server** exposing at minimum a fixture-introspection tool so skills can reference real fixtures by name.
- Markdown ↔ compiled-test pair conventions (file layout, naming, section structure — see §3 and §4 and §5).
- Installer (`act init`) that installs Playwright, Playwright MCP (project-local), act framework/skills/MCP, and scaffolds an example test against a target project.
- **Quality bar**: early-adopter ready. Installable by a stranger with docs. Works against a sample SvelteKit app (Kiln) end-to-end.
- Integration with **Claude Code** as the v1 coding-agent target.
- Default reporter: Playwright's pretty CLI output.

### 2.2 Designed-for but not built in v1

We must not paint ourselves into corners that block these:

- **Discovery skill** — a cold-start skill that reads a codebase and plans a full test suite. Design implication: test artifacts must be discoverable and authoring must not assume pre-existing human context.
- **CI-triggered heal** — heal runs locally in v1, but nothing about the heal pipeline should assume a human is present; it should be possible to run it headless in CI later with only a config flip.
- **JSON / JUnit reporters and machine-readable heal output** — v1 produces pretty CLI output only, but the underlying data should be structured internally so later reporters are additive, not a rewrite.
- **Other coding agents** (Cursor, Codex, OpenCode, etc.) — v1 installs into Claude Code; the installer's agent detection and skill/MCP placement should be abstracted enough that adding another agent is a config-table addition, not a refactor.
- **Other browsers** (WebKit, Firefox) — Playwright supports them; user can flip a config. Act itself must not hard-code Chromium anywhere.

### 2.3 Out of scope for v1

- Visual/snapshot testing (act is a11y-based)
- Performance testing
- Load testing
- API-only testing (act is for UI tests; users should use Playwright's API testing directly for API tests)
- Public docs site, polished package distribution, SemVer policy beyond "what npm gives you by default"
- Non-Node runtimes

## 3. Key Design Decision — File Layout

> **This is a proposal, not a closed decision.** I evaluate the leading options below and recommend one. Push back if you prefer another.

A test has two concerns that must coexist on disk: (a) the English **intent** (source of truth, human-authored/edited, read during heal) and (b) the **compiled Playwright Test** code (build artifact, regenerable, executed). Both are source-controlled. The question is how to organize them.

### Option A — Two sidecar files (recommended)

```
tests/act/login.act.md        ← intent (human writes / heal reads)
tests/act/login.act.ts        ← compiled (agent writes; Playwright runs)
```

- Shared stem (`login`), paired by filename convention.
- Every test is exactly two files, both committed.
- `login.act.ts` is a standard Playwright Test file: `import { test, expect } from '@playwright/test'` — Playwright runs it natively with zero config.

**Pros**
- Zero magic at runtime: Playwright sees a `.ts` file, runs it. No loaders, no transforms.
- Each file is in its natural form — `.md` renders as markdown everywhere (GitHub, IDE, preview), `.ts` gets full IDE / tsc / prettier / eslint support.
- Diffs are crisp: intent changes land in `.md`, code changes land in `.ts`. Reviewers see at a glance which side moved.
- Easy rules: "if `.ts` changed but `.md` didn't, that's a compile/heal output — fast-review"; "if `.md` changed, intent moved — read carefully".

**Cons**
- Two files per test; mild filesystem noise.
- Pair-integrity must be enforced in tooling (`.md` without `.ts`? `.ts` without `.md`?).
- Renames must move both files atomically.

### Option B — Single `.act.ts` with embedded description

```ts
// tests/act/login.act.ts
export const description = `
# Login

## Goals
User can log in with valid credentials.
...
`;

import { test, expect } from '@playwright/test';
test('login', async ({ page }) => { ... });
```

**Pros**
- One file per test.
- No pairing problem.

**Cons**
- Intent lives inside a TypeScript string literal — escaping, no markdown rendering, poor review experience.
- Compiler must carefully edit only the code portion without touching the string — regex-fragile, easy to corrupt the description on a bad heal run.
- Interleaved diffs: intent changes and code changes mingle in one hunk.
- Markdown tools (preview, link-check, code-fence highlighting) don't work.

### Option C — Single `.act.md` with embedded code fence

```markdown
# Login

## Goals
User can log in with valid credentials.

## Compiled

​```ts
import { test, expect } from '@playwright/test';
test('login', async ({ page }) => { ... });
​```
```

**Pros**
- One file, intent is the "shell".
- Reads nicely in markdown previews.

**Cons**
- Playwright can't run this file. Either (a) the compile step also writes a `.ts` sidecar (defeating the point of one file), or (b) we write a custom Playwright loader that extracts the fence and runs it (runtime magic, which the thesis argues against).
- Heal must rewrite a code fence inside markdown without corrupting the surrounding text — fiddly.
- IDE / debugger support for code-inside-markdown is poor.

### Recommendation: **Option A (sidecar pair)**

Option A has the strongest fit for the thesis: Playwright runs its native file type with zero magic, diffs are clean, tooling works by default. The pairing overhead is small and easily tool-enforced (a lint check at `act init` / in CI). Options B and C trade real ergonomics for cosmetic "single-file" gains.

**If Option A**, naming: `NAME.act.md` + `NAME.act.ts`. The `.act.` infix makes tests visible to tooling and to humans, and is consistent with the ecosystem's "label your test files" pattern. Open alternative: `.actr.` (rarer collision risk) — minor.

## 4. Key Design Decision — Test Location

> Also a proposal, not closed.

### Option A — Fixed home folder

All tests live under a convention, e.g. `tests/act/`. The installer scaffolds this directory.

**Pros**: one place to look; simple mental model; matches Playwright's `testDir` concept directly.
**Cons**: forces users whose repos are structured feature-by-feature to break that convention for tests.

### Option B — Discovery by glob

Tests can live anywhere; act (really Playwright) finds them via `**/*.act.{md,ts}`.

**Pros**: fits feature-colocated repos (e.g. `features/auth/login.act.ts` alongside the feature code).
**Cons**: no central "here are my tests" location; new contributors don't know where to look.

### Option C — Hybrid: configured home folder, glob-based discovery within it

Playwright's `testDir` points to the home folder (default `tests/act/`). Within it, any `*.act.ts` is a test. Users who want feature-colocated tests change `testDir` (or use multiple Playwright projects).

**Pros**: single knob for the common case; flexibility when needed; leverages Playwright's existing `testDir` / `testMatch` primitives — we don't invent anything.
**Cons**: slightly more moving parts than Option A.

### Recommendation: **Option C**

Default `testDir: 'tests/act'` and `testMatch: '**/*.act.ts'`. Users who want colocation flip the Playwright config. This is the "stand on shoulders" answer — act contributes defaults, Playwright provides the mechanism.

## 5. Markdown Test Description Format

- **Freeform prose** with conventional section headers. Headers are a guide, not enforced.
- **No frontmatter** in v1. The filename is the test name, just like every other test tool. (Future: optional frontmatter for tags, owners, etc. — not needed yet.)
- The compile/heal LLMs read the markdown and complain to the user if intent is unclear. That's the enforcement mechanism — not a schema.

### Suggested section layout

```markdown
# Login with valid credentials

## Goals
A user with a valid email/password can sign in from the homepage and
lands on their dashboard.

## Fixtures
- reset_db
- seed_user: alice@example.com / correct-horse

## Hints
- The login form is behind the "Sign in" button in the header.
- The dashboard is at /dashboard after redirect.

## Assertions
- Dashboard greeting shows "Welcome, Alice".
- URL is /dashboard.
```

- **Goals** — what behavior is being verified. Prescriptive to the compiler.
- **Fixtures** — optional. Names reference Playwright fixtures or fixture-like helpers (see §6). The compiler wires these into the compiled `.ts`.
- **Hints** — disposable author notes to help the compiler find things the first time. Safe to delete post-compile.
- **Assertions** — optional; explicit post-conditions. If present, compiler must reflect them.

No other sections are required. An author who writes three lines of prose under just `# ...` and nothing else is valid input; the compiler will ask questions if it can't figure out what to do.

## 6. Fixtures

Fixtures are ordinary **Playwright Test fixtures** (TypeScript). Act does not invent a fixture system. Composition, lifecycle, parameterization, etc. — all Playwright.

### How markdown references fixtures

Both directions are supported (user said "both"):

1. **Referenced by name in markdown** — under a `## Fixtures` section (or equivalent), the author lists fixture names: `- log_in_as_admin`. The compiler wires these into the compiled test's fixture parameter list.
2. **Added in code** — the compiler (or a later heal) may add fixtures the markdown doesn't list (e.g. if a hint implies a logged-in state). The compiled `.ts` is the ground truth for what the runner actually uses.

Neither direction is authoritative on its own: markdown says what the *author* wants; compiled `.ts` says what *ran*. Drift between them is a heal signal (and a possible `act doctor`-type check in a future version).

### Fixture introspection via act MCP

For `/act:new` and `/act:heal` to reference fixtures sensibly, the agent needs to know what's available. The act MCP server exposes (at minimum):

- `list_fixtures` — returns each fixture's name, signature/type, and a docstring if present. The agent uses this to suggest fixtures, validate that a markdown-referenced fixture exists, and explain options to the user.

(Additional tools — `list_tests`, source readers, etc. — are architecture-level and deferred to the architecture doc. See §12.)

## 7. Compiled Test Structure

A compiled test is a plain Playwright Test file. No act import is required to *run* it — the file is idiomatic Playwright.

```ts
// tests/act/login.act.ts
// ACT: compiled from login.act.md on 2026-04-17. Hand-edits will be overwritten by /act:heal.
import { test, expect } from '@playwright/test';
import { seedUser, resetDb } from '../fixtures/user';

test('login with valid credentials', async ({ page }) => {
  await resetDb();
  await seedUser({ email: 'alice@example.com', password: 'correct-horse' });

  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill('alice@example.com');
  await page.getByLabel('Password').fill('correct-horse');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { name: 'Welcome, Alice' })).toBeVisible();
});
```

- The header comment names the source markdown and flags the file as compiled.
- Locators prefer `getByRole` / `getByLabel` / `getByText`. The compile skill's "locator guidance" primitive enforces this in the agent loop.
- Test names come from the `test('...')` call; heuristic: derived from the `# H1` of the markdown, sanitized.

### Open question: Hand-edited compiled tests

If a user hand-edits `login.act.ts`, should act:
- **(i)** Refuse to overwrite on next heal (treat `.ts` as authoritative once touched)?
- **(ii)** Overwrite silently, trusting the user to re-run compile if they wanted to change intent?
- **(iii)** Detect divergence (e.g. via a checksum or git-diff check), warn, and ask?

**Recommendation: (ii)** for v1. The contract is *markdown is intent; `.ts` is artifact*. Hand-edits are against the grain. If a user wants persistent hand-tuning, they should put it in a fixture or update the markdown. A future `doctor` command can surface divergence. But this is worth a yes/no.

## 8. User-Facing Skills

Both skills are agent skills invoked from the user's coding agent (Claude Code in v1).

### 8.1 `/act:new` — Interactive authoring

**Purpose**: get a new test from blank-slate to "committed, compiled, green".

**Flow**
1. User invokes `/act:new`, optionally with a seed description.
2. Skill asks clarifying questions: what screen/flow, what outcome, any preconditions (login state, seed data). Uses `list_fixtures` from act MCP to suggest existing fixtures.
3. Skill drafts `NAME.act.md`. Presents to user. Iterates until user says "yes".
4. Skill launches a **headed** browser via Playwright MCP (so the user can watch). Navigates the app, performs the actions described, and at each step identifies the locator it would encode.
5. Skill writes `NAME.act.ts`. Formats/lints.
6. Skill runs the compiled test (`npx playwright test NAME.act.ts`) to verify green. If it fails, it diagnoses and either (a) fixes the compiled test, or (b) asks the user to clarify the markdown.
7. On green, the skill reports success and ends. Committing is not the skill's job (the user's usual commit flow handles that, or a separate `/commit` skill).

**Edge cases**
- **User kills the browser mid-compile**: skill cleans up and asks if they want to retry.
- **Target app isn't running**: skill detects (first navigation fails) and asks the user to start the server, or checks Playwright's `webServer` config and starts it.
- **Markdown says something that can't be verified against the running app**: skill pushes back with specifics before writing any code.
- **Fixture named in markdown doesn't exist**: skill asks the user whether to create it, pick a different one, or remove the reference.

### 8.2 `/act:heal` — Run, triage, repair, report

**Purpose**: re-green a suite that failed because the UI drifted.

**Flow**
1. Run the compiled suite via Playwright (`npx playwright test`, captured output).
2. Partition results:
   - **Passed** → nothing to do.
   - **Passed on retry (flaky)** → include in report as flaky, no action.
   - **Failed** → proceed to triage.
3. For each failure, dispatch a triage subagent that:
   - Reads the markdown source of truth.
   - Reads the compiled `.ts`.
   - Inspects the failure artifacts (Playwright's trace, error messages).
   - Launches Playwright MCP, navigates the app, and determines whether:
     - **Real app bug** — the app genuinely does not match the intent. No test change. Flag as "App bug suspected" with evidence.
     - **UI drift** — the intent still matches the app, but locators/selectors changed. Rewrite the compiled `.ts`. Re-run the single test to verify green. If green, flag as "Healed". If still failing, escalate.
     - **Ambiguous** — cannot confidently decide between the above.
     - **Unhealable** — drift-looking, but rewrite attempts didn't produce a green run.
4. If any failures are **Ambiguous** or **Unhealable**, **block** and surface them interactively to the user before producing a final report. The user's job is to push each ambiguous case into one of: real-bug-confirmed, or drift-here's-the-fix. (The user may accept a partial report if they want.)
5. Produce final report (in the skill's chat message — see §8.3).

**Mandatory re-run policy**: every rewritten test is re-run in isolation before being counted as "Healed". No self-reported heals without a green re-run.

**Parallelism**: heal may run triage subagents in parallel (architecture decision). Does not affect the report contract.

### 8.3 Heal report format

Final artifact is the skill's final message in the user's chat. **Not** written to a file in v1 (user chose A in "heal report" options).

Structure:

```markdown
## ActRight heal report — 2026-04-17

**Summary**: 42 tests run — 38 pass, 2 flaky, 1 healed, 1 app bug.

### Healed (1)
- `tests/act/login.act.ts` — locator for "Sign in" changed from text to role-based. Fix committed to working tree.
  Diff: [short snippet]

### App bugs suspected (1)
- `tests/act/checkout.act.ts` — submit button does nothing after entering a valid card. Reproduced in Playwright MCP; see trace at [path].

### Flaky (2)
- `tests/act/search.act.ts` — failed once, passed on retry.
- ...

### No action (38 passing)
```

Report contains: counts, per-category entries, per-entry evidence. Code changes land in the working tree (not auto-committed); diff is shown inline.

## 9. CLI Surface

The user asked to keep this light and defer specifics. Here is the minimum v1 surface:

- **`act init`** — the installer (§11). This is the only act-specific CLI subcommand v1 *needs*.
- **Running tests** — the user runs Playwright directly: `npx playwright test`, or a scaffolded `npm run test:act` alias. Act does not wrap this. If, at the end of v1, a thin `act run` subcommand that shells to Playwright proves useful for discoverability, fine — but it is not a deliverable.
- **Compiling / healing** — v1 invokes compile and heal from the coding agent via skills. No user-facing `act compile` / `act heal` CLI in v1. (These would be needed for CI-triggered heal — out of v1 but designed-for.)

**Exit codes** (inherit Playwright):
- `0` — all tests passed (or passed on retry; flakes are reported but don't fail the run).
- `1` — one or more tests failed.
- Any tool failure (compile can't reach the app, MCP unavailable, config invalid) — distinct non-zero code when surfaced through act entry points. Playwright's own `2`+ codes continue to mean what they mean.

## 10. Configuration

**Principle**: reuse `playwright.config.ts`. Do not invent a parallel config file.

Most configuration users care about — `baseURL`, `webServer`, `testDir`, `testMatch`, `workers`, `retries`, `use`, `projects` — is already Playwright's job. The installer seeds sensible defaults; users edit them like any Playwright project.

**Act-specific config lives under an `act` key on the Playwright config** (or, if Playwright doesn't expose unknown-key tolerance, a sibling `act.config.ts` that imports and merges). Exact location is an architecture call, but the user-facing spec commits to "one config file, not two."

Anticipated act-specific fields (subject to architecture refinement):

| Field | Default | Purpose |
|---|---|---|
| `fixturesDir` | `tests/act/fixtures` | Where act MCP looks for fixtures to expose via `list_fixtures`. |
| `descriptionsGlob` | `**/*.act.md` | Where act looks for markdown tests (mirrors Playwright's `testMatch`). |
| `agent` | `'claude'` | Agent flavor (for installer / MCP placement). |

Everything else Playwright already covers.

## 11. Installer (`act init`)

> Detailed installer behavior is partially deferred to architecture per the user. v1 surface below.

### Parameters (from project overview)

- `--path <dir>` — act home / test directory. Default `tests/act`.
- `--agent <claude|none>` — target coding agent. Default `claude`. v1 only supports `claude` meaningfully; `none` skips skill/MCP install.
- `--ci <github|none>` — **P2, deferred**. Adds `.github/workflows/act.yml` or similar. Out of v1.

### Behavior (idempotent; re-runnable to upgrade)

1. Detect the project: `package.json`, existing Playwright install, existing agent config.
2. Add dev deps if missing: `@playwright/test`, `act-framework` (name TBD).
3. Install Playwright browsers if needed (`npx playwright install chromium`).
4. Scaffold the act home folder: `tests/act/` with a README and one example test pair (`.act.md` + `.act.ts`) that passes against a minimal sample.
5. Scaffold or extend `playwright.config.ts` with the act defaults (`testDir`, `testMatch`, act section).
6. Install **Playwright MCP** project-local and register it in the agent's MCP config (`.mcp.json` or `.claude/mcp.json`).
7. Install act skills into the agent's skills dir (e.g. `.claude/skills/act/`).
8. Add/extend `.gitignore` as needed (likely nothing v1-specific; Playwright's own ignore entries are already standard).
9. Print a "next steps" message — how to run tests, how to author the first test.

### Non-goals

- Does not scaffold a new project from scratch (no `npx create-act-app`). It installs into existing projects.
- Does not touch unrelated config (lint, prettier, tsconfig).
- Does not alter existing test directories unless the user explicitly reuses them.

### Target app verification

v1 ships verified against **Kiln (SvelteKit)**. Other frameworks (Next, Vite, Nuxt, Remix, etc.) are expected to work because the installer makes no framework-specific assumptions, but only Kiln is exercised end-to-end as a release gate.

## 12. Act MCP Server

The act MCP server exposes project introspection tools to the coding agent so the skills can operate without re-parsing the codebase every run. v1 minimum tools:

- `list_fixtures` — names, signatures, docstrings of available Playwright fixtures.
- (Additional tools — `list_tests`, source-readers, etc. — architecture-level; deferred.)

The act MCP is installed project-local by `act init` alongside Playwright MCP.

**Boundary**: act MCP is for project *introspection and compile/heal coordination*. It does not drive the browser — that's Playwright MCP. It does not run tests — that's Playwright. It does not author files the agent could trivially author with filesystem tools.

## 13. Framework / Shim Package

Minimum viable v1 package is almost empty:

- Conventions (file naming, markdown section guidance) — mostly documented, not code.
- A tiny helper export (if needed) for authors who want typed access to act-specific fixture helpers — maybe just `import { defineFixture } from 'act-framework'`. Exact API is architecture-level.
- The compile and heal *logic* does not live in the shipped framework package — it lives in the skills that ship with the installer.

"Standing on shoulders" means the framework package is thin on purpose. If a user opens their compiled `.ts` and sees only `@playwright/test` imports and normal Playwright code, that's a feature.

## 14. Edge Cases & Error Handling

| Situation | Behavior |
|---|---|
| `.act.md` without paired `.act.ts` | Lint warning; treat md as "uncompiled"; `/act:new` resumption can compile it. |
| `.act.ts` without paired `.act.md` | Lint warning; `/act:heal` cannot heal without intent; skill asks user to author or delete. |
| `.act.md` edited after `.act.ts` was compiled | Expected drift. `/act:heal` treats as "intent changed" rather than "app drifted"; on next heal run the test is recompiled. |
| Compile agent cannot reach target app | Skill surfaces "is your dev server running?" / checks Playwright `webServer` config. |
| Compile agent fails to produce a green test after N attempts | Escalate to user with evidence (what it tried, what went wrong). No silent failure. |
| Fixture named in markdown doesn't exist | Skill asks to create, substitute, or remove. Compile does not proceed with a nonexistent reference. |
| Hand-edited `.ts` then heal runs | Per §7 recommendation: heal overwrites. User is warned at `act init` that `.ts` is an artifact. (Subject to final decision.) |
| Parallel heals modifying the same file | v1: fire a lock (simple file lock or in-memory); serialize per-file rewrites. |
| Playwright retry greens a flake | Reported as flaky in the heal report; exit code unchanged (0). |
| Heal encounters ambiguous or unhealable failure | Interactive prompt before final report. User must triage each. |
| User interrupts mid-heal | Partial progress preserved (already-rewritten tests remain); no rollback. Skill can resume. |
| `act init` run twice | Idempotent: updates deps and configs in place, does not overwrite an existing example test. |

## 15. Scope Summary

**In v1**
- Skills: `/act:new`, `/act:heal`
- Act MCP server (`list_fixtures` at minimum)
- Thin framework package
- Installer (`act init`), claude + no-ci paths
- File/location conventions (per §3 / §4 recommendations)
- Markdown format (per §5)
- Pretty CLI output via Playwright
- Installs and produces a green test suite on Kiln (SvelteKit)
- Claude Code as the supported coding agent

**Designed-for, deferred**
- `/act:discover` skill
- CI-triggered heal
- JSON / JUnit reporters
- Other agents (Cursor, Codex, OpenCode)
- Other browsers (WebKit, Firefox)

**Out**
- Runtime LLM of any kind
- A parallel/competing test runner
- Visual/snapshot testing
- Non-UI test modes

## 16. Open Questions (need user input before completion)

1. **File layout**: confirm Option A (sidecar `.act.md` + `.act.ts`) — §3.
2. **Test location**: confirm Option C (configured home + glob, default `tests/act/**/*.act.ts`) — §4.
3. **Hand-edited compiled tests**: confirm §7 recommendation (heal overwrites; `.ts` is artifact) or pick alternative.
4. **Markdown file extension**: `.act.md` vs. `.actr.md` vs. other — §3. Default leaning `.act.md`.
5. **Act MCP tool list beyond `list_fixtures`**: any you want locked in at functional-spec level (e.g. `list_tests`), or deferred to architecture? §12.
6. **Framework package name**: `act-framework`, `@actright/core`, something else? §13.
