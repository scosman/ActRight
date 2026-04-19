---
status: complete
---

# Functional Spec: ActRight v1

## 1. Thesis & Boundary

**Thesis.** AI writes and heals tests. AI never runs them. The test suite is pure Playwright Test code that executes deterministically with no LLM in the loop.

**ActRight is skills plus conventions on top of Playwright Test.** It is not a new test runner, a new browser driver, a new fixture system, or a new CLI. There is no `act-framework` npm package. There is no `act` binary. Tests are ordinary `*.spec.ts` files; an act-managed test is identified solely by a specific docstring convention.

**What act owns**
- The docstring convention for describing tests in English (`@act` tag, freeform markdown body).
- The agent skills that author (`/act:new`), heal (`/act:heal`), set up (`/act:setup`), and later discover (`/act:discover`, v1+) tests.
- Authoring/heal-time orchestration: driving a browser via Playwright MCP, generating and editing Playwright Test code, interacting with the user.

**What act does NOT own — delegated to Playwright**
- Running tests (`npx playwright test`).
- Browsers — which ones, headed vs. headless, install (Playwright configures).
- Fixtures (Playwright Test fixtures; act adds nothing).
- Parallelism, retries, timeouts, workers (Playwright config).
- `baseURL` and server lifecycle (Playwright's `webServer` config).
- Test discovery on disk (Playwright's `testDir` / `testMatch`).
- Secrets / env (the project's existing `.env` or Playwright's `use` hooks).
- Reporters (Playwright's CLI / JSON / JUnit / HTML — all configured in `playwright.config.ts`; act picks none).
- Initial Playwright install and scaffolding (act delegates to `npm init playwright@latest` rather than reimplementing).

Any time v1 is tempted to reinvent a Playwright concern, the answer is back away and let Playwright do it.

**Note on `/act:setup`.** `/act:setup` is involved in getting several of the items above into a working state on a new project — Playwright installed, browsers installed, Playwright MCP registered with the agent, `baseURL` / `webServer` sensibly configured, etc. This is *setting up* Playwright, not owning it: act delegates to Playwright's own installer and config, introduces no act-specific conventions on top, and leaves any existing Playwright install/config alone. See §5.2.

## 2. Scope

### 2.1 In v1

- `/act:new` — interactive authoring single test or small set of related tests
- `/act:heal` — run + triage + repair + report.
- `/act:setup` — one-time setup (delegates Playwright install to Playwright; wires up Playwright MCP and an example act test).
- Docstring convention (§3).
- Bundled helper scripts (§5.7) — TS-Compiler-API-based introspection for fixtures, act-managed tests, docstring parsing. Replaces any need for an act MCP.
- Claude Code as the supported coding agent.
- Verified end-to-end against **Kiln (SvelteKit)**.
- Quality bar: **early-adopter ready**. Installable by a stranger with docs.

### 2.2 Designed-for, not built in v1

The v1 design must not block these:

- `/act:discover` — cold-start skill that reads a codebase and drafts an initial test suite.
- CI-triggered heal — heal runs locally in v1, but nothing in the heal design assumes a human is present. In CI, Playwright MCP and agent interaction run non-interactively; the heal pipeline should accommodate that without a rewrite.
- Machine-readable heal output — v1 emits the heal report as a chat message; if we later need machine readable, can be done with re-running act tests and comparing to results before heal, and injecting results. Not part of V1 
- Other coding agents (Cursor, Codex, OpenCode, …). Installer/skill placement should abstract around agent identity, not hard-code Claude.
- Other browsers (WebKit, Firefox). Playwright supports them; act must not hard-code any browser anywhere.

### 2.3 Out of scope for v1

- Runtime LLMs of any kind.
- A parallel or competing test runner, browser driver, or fixture system.
- Visual / snapshot testing.
- Performance / load testing.
- API-only testing (use Playwright's API testing directly).
- Polished public distribution, docs site, strict SemVer policy beyond default npm. V1 is great dev-centric README.
- An **act MCP server**. Project-introspection helpers (fixture listing, test enumeration, docstring parsing) ship as bundled scripts that run project-local — see §5.7. Scripts cover the use cases we have with less complexity than an MCP; not planned for v1 or anticipated for later.
- A dedicated framework npm package. Tests import from `@playwright/test` only.

## 3. Docstring Convention (the central design)

An act-managed test is a standard Playwright `test()` call with a specific docstring immediately above it. The docstring is how act tells itself "I own this test" and is the source of truth for the test's intent.

### 3.1 Shape

```ts
import { test, expect } from '@playwright/test';

/* @act
## Goals
User with valid credentials signs in from the homepage and lands on the dashboard.

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
  await page.getByLabel('Email').fill('alice@example.com');
  await page.getByLabel('Password').fill('correct-horse');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { name: 'Welcome, Alice' })).toBeVisible();
});
```

### 3.2 Rules

- **Delimiter**: `/*` … `*/` (a regular block comment). Not `/**` JSDoc.
  - Rationale: the body is markdown with no leading asterisks (per user preference — easier to read). Using a plain block comment is honest about that; using `/**` and omitting the line asterisks is an awkward middle ground that confuses JSDoc tooling. 
    - Note: Prettier and most formatters leave /* */ block comments alone but will sometimes reflow or re-asterisk /** */ blocks, which would destroy markdown.
- **First line**: the literal tag `@act`, optionally followed on the same line by whitespace only. The tag must appear on the opening line of the comment (not later).
- **Body**: freeform markdown.
- **Suggested sections** (use what's relevant; authors are not required to use all four):
  - `## Goals` — what behavior is being verified. The authoring and heal agents treat this as prescriptive.
  - `## Fixtures` — named fixtures or preconditions. See §6.
  - `## Hints` — disposable author notes for the agent (e.g. "the gear icon is in the sidebar").
  - `## Assertions` — explicit post-conditions. If present, the test body must honor them.
- **Placement**: the comment must be **immediately above** the `test()` call it describes — no blank lines, no other statements between. (This keeps AST walking cheap and matches authors' intuition.)
- **One docstring per `test()` call.** A file may contain multiple act-managed tests, each with its own docstring.
- **Hand-written Playwright tests in the same file** (no `@act` docstring) are ignored by act skills. They run normally via Playwright.
- **No frontmatter.** The `test('name', …)` argument is the test name, as in every other Playwright project.

### 3.3 Identifying act-managed tests

A static check suffices: any `*.spec.ts` file containing a comment starting with `/* @act` (at the start of a comment). No AST parse required for discovery; skills confirm intent by parsing the matched block when they act on it.

### 3.4 Authoring-only vs. committed-intent

The docstring is **approved by the human, respected by the agent**. Heal rewrites the test body. Heal does not rewrite the docstring unless explicitly asked (e.g. intent changed, re-author). See §5.4 for the heal-edit policy.

The docstring can be written by human or agent, but the agent never writes or modifies without human approval.

## 4. File Discovery

Discovery has two layers; act owns only the inner one.

**Which files are Playwright tests? — Playwright owns this.** Test files are whatever Playwright finds via its own `testDir` / `testMatch`. Act does not prescribe or override. `/act:setup` delegates Playwright scaffolding to `npm init playwright@latest`, so the project ends up with whatever `testDir` / `testMatch` Playwright's own initializer sets; if the project already has a Playwright config, act leaves it alone.

**Which of those tests are act-managed? — act owns this.** The signal is the `/* @act` marker on a `test()` call. Skills scan only within the files Playwright has already claimed as tests, and then use the marker to distinguish act-managed tests from hand-written Playwright tests. The bundled helper script `list-act-tests.ts` (§5.7) does this walk via the TypeScript Compiler API and returns per-test metadata (file, test name, docstring text, line range). Skills use that script whenever they need the list.

Authors who want visual separation between act-managed tests and hand-written Playwright tests can organize however they like (`tests/act/` vs. `tests/manual/`, feature-colocated, or not separated at all). Act doesn't care — the marker is what matters, not the path.

## 5. Skills

All skills are agent skills. 

Getting act into a new project is a two-step process, explicitly separated:

1. **Install act into the project** (§5.1) — a one-time, project-level install of the act skills. Done via a shell one-liner (git clone) from the project root. Not a skill (can't be, until act is installed).
2. **Set up the project** (§5.2, `/act:setup`) — a per-project skill that, once act is installed, wires up Playwright + Playwright MCP + an example test for the current repo.

### 5.1 Installing act (one-time, project level)

Act's skills live in a git repo. Installing act means cloning that repo into the location the project's agent scans for skills. For Claude Code in v1, that's `.claude/skills/actright` at the project root:

```sh
# from the project root
git clone --single-branch --depth 1 https://github.com/scosman/ActRight.git .claude/skills/actright
```

Under the main claude code example, we'll inlcude a section for other popular tools, explainng you can swap the directory for different targets Claude global (~/.claude/skills), Claude project local (`.claude/skills`), cursor global/local, windsurf, etc.

After this runs, the act skills (`/act:setup`, `/act:new`, `/act:heal`) are available to the agent when working in this project. Updating act in the project is a `git pull` in that directory. Uninstalling is deleting it.

- Not a skill: this has to be a shell command because skills can't install themselves.
- Not a published npm package in v1: direct git clone keeps distribution trivial for early adopters. A real package (`npm i` or equivalent, published skills registry) is deferred.
- Gitignore / commit decisions are the project's call, not act's. Projects already have their own convention for `.claude/` (commit it to share skills with the team, or ignore it so each developer installs their own). Act does not prescribe either way and does not ship a `.gitignore` entry.

### 5.2 `/act:setup` — per-project bootstrap

**Purpose**: once act is installed (§5.1), take a project from "nothing act-specific here" to "I can author a test." `/act:setup` owns only the act-side glue and otherwise delegates to Playwright.

**Flow**
1. Detect: `package.json`, existing `@playwright/test` install, existing `playwright.config.ts` (and whether it already has `use.baseURL` / `webServer` set), existing agent MCP config, and `package.json` scripts that look like a dev server (`dev`, `start`, `preview`, …).
2. Prompt interactively for the small number of choices that aren't detectable:
   - Coding agent (claude in v1; no other options yet).
3. **Install Playwright, if needed.** If Playwright isn't already installed, delegate the whole install to Playwright itself: run `npm init playwright@latest ...` and let Playwright's own initializer handle deps, browsers, `playwright.config.ts`, and any example tests. If Playwright is already installed, skip this step — do not modify an existing config. You'll need to pass several args to get it to run without interaction (--quiet, --lang, --browser, --gha [github actions], others). During architecture design spec out the defaults, and have a step to confirm with user and allow them to change. Some should be smartly detected (suggest --gha if they already have a .github/workflows dir, lang should be based on existing codebase, etc).
4. **Install Playwright MCP** project-local and register it in the agent's MCP config (`.mcp.json`).
5. **Scaffold an install-verification test** — one `.spec.ts` file with a tiny `@act` docstring and a trivial test that passes against a `data:` URL or equivalent. Verifies the act + Playwright + MCP stack works with no dependency on the user's app. Run it immediately; fail fast if the install is broken. Placed under whatever `testDir` Playwright configured.
6. **Configure the command that starts the app server (interactive, essential).** Playwright's `playwright.config.ts` supports a `webServer` block whose `command` field tells Playwright how to start the user's app (e.g. `npm run dev`, `npm run build && npm run preview`, a Python/Go/Rails command, etc.). Playwright starts the server before the test run and shuts it down after. Combined with `use.baseURL`, tests can write `page.goto('/')` without caring about ports. This is a Playwright feature; act just walks the user through configuring it — but treats it as essential, not optional, because the assumption "a dev server is already running" is fragile and makes test runs non-deterministic.

   Flow:
   - If `webServer` + `baseURL` are already set in `playwright.config.ts`, skip — act doesn't override existing config.
   - Otherwise, propose detected values and have the user confirm or edit each:
     - **`command`** (required) — the shell command to start the app. Detected from `package.json` scripts (`dev` / `start` / `preview`) when available; otherwise prompt. No command → can't continue, surface clearly.
     - **`url`** — the URL Playwright polls to know the server is ready. Propose a sensible default for the detected stack (e.g. `http://localhost:5173` for Vite/SvelteKit, `http://localhost:3000` for Next, etc.).
     - **`use.baseURL`** — same as `url` by default.
     - **`timeout`** — Playwright's default is usually fine; surface it so the user can bump for slow boots.
   - Write `webServer` (with `command` and `url`) and `use.baseURL` into `playwright.config.ts`. Default `reuseExistingServer: false` — always start a fresh server for each test run; don't assume one is already up. If the port is in use when tests run, the user gets a clear Playwright error; they can flip `reuseExistingServer` themselves if they prefer to reuse a local dev server for faster iteration.
   - Only skippable by the user as an explicit opt-out ("I'll wire up `webServer` myself later"). `/act:setup` records the skip and offers it again on re-run. Default path does not let the user drift past this step by accident.
7. **Scaffold a real sanity test against the app (interactive; only if step 6 completed).** One more `.spec.ts` with an `@act` docstring for "the app loads" — navigates to `/`, asserts the page has a title or a visible landmark, no auth required. Run it with Playwright managing the dev server via `webServer`. On green, the full stack is verified end-to-end. On failure, surface the error — most likely the dev-server command or baseURL is wrong, and the user edits and retries interactively.
8. **Scaffold core fixtures (interactive; only if step 7 passed).** Most apps have a small set of reusable setup states that downstream tests depend on: create account, log in, create organization/project, seed some dummy data, etc. Without these, every test re-implements auth/setup and diverges. `/act:setup` gets the user a head start on them. Flow:
   - Ask the user whether their app has such reusable setup state, and if so, to name the ones they want (free text, or a checklist of common ones: *sign up*, *log in*, *create project*, *seed data*). User can skip entirely.
   - For each named fixture:
     - Agent reads the relevant parts of the codebase (auth routes, signup forms, API endpoints, seed scripts if any) to understand how the state is actually produced in this app. Uses Playwright MCP to explore the UI path when needed (e.g. finding the signup form's fields).
     - Agent writes the fixture as a standard **Playwright Test fixture** (`test.extend({...})`) in the project's fixtures file (creating the file if absent; convention from §6). Fixtures compose naturally — `logged_in` depends on `signed_up`, etc.
     - Agent writes **one sanity `@act` test per fixture** that exercises the fixture and makes a simple assertion (e.g. `logged_in` → navigate to a logged-in-only page, assert it rendered). Same docstring convention as any other act test (§3).
     - Runs the sanity test. On green, the fixture is confirmed working. On red, iterates with the user — same loop as `/act:new` (§5.3).
   - If the user skips or partially completes, `/act:setup` records what was done and what's still pending; a re-run picks up from there.
   - Non-goal: `/act:setup` is not trying to discover every reusable state in the app — that's `/act:discover` (v1+). It only seeds the few the user knows they need up front.
9. **Print "next steps"**: how to run tests, how to invoke `/act:new`, which sanity tests passed, and which fixtures were scaffolded.

**Idempotent**: safe to re-run. Detects what already exists (Playwright install, MCP registration, example tests, `webServer`/`baseURL` config, already-scaffolded fixtures and their sanity tests) and skips; never overwrites an existing Playwright config, example tests, or fixtures. Re-running after a skipped step offers to complete it.

**Non-goals**
- Does not install act itself — that's §5.1, done outside the agent.
- Does not create a new project from scratch (no `create-act-app`). Installs into existing projects.
- Does not touch unrelated config (lint, prettier, tsconfig).
- Does not reimplement Playwright's installer — if Playwright isn't installed, act runs Playwright's own installer.

### 5.3 `/act:new` — interactive authoring

**Purpose**: take a new test from blank-slate to "committed, runnable, green".

**Flow**
1. User invokes `/act:new`, optionally with a seed description.
2. Skill asks clarifying questions: what screen/flow, what outcome, any preconditions. Reads the project's fixture files directly from disk to surface existing fixtures for reuse.
3. Skill drafts the `@act` docstring. Shows it to the user; iterates until approved.
4. Skill launches a **headed** browser via Playwright MCP so the user can watch. Navigates the app, performs the steps the docstring describes, and at each step identifies the locator it would encode (preferring `getByRole`, `getByLabel`, `getByText`).
5. Skill writes the `test()` call with the docstring above it. If the target file exists, the test is appended; otherwise a new `*.spec.ts` file is created under `testDir`.
6. Skill runs the test (`npx playwright test <path> -g <name>`) to verify it's green. On failure, it iterates: fix the test body, or (if intent vs. reality mismatch) ask the user to clarify the docstring.
7. On green, the skill reports success. Committing is the user's responsibility (or a separate `/commit`-style skill).

**Edge cases**
- **User kills the headed browser**: skill cleans up, asks whether to retry.
- **Target app isn't running**: skill surfaces "is your dev server running?" and, if the project's `playwright.config.ts` defines `webServer`, offers to start it.
- **Intent can't be verified**: skill pushes back with specifics before writing any code.
- **Fixture named in docstring doesn't exist**: skill asks to create it, pick an existing one, or drop the reference.
- **Multiple Tests** the user may use `act:new` to generate a set of tests around a feature. If so, add a starting phase to browse feature code and suggest test set. Iterate until the set is approved, then using planning mode to perform steps 1-7. Ask if user wants it to be interactive, or autonomous when doing more than 1 test. If autonomous - browser isn't headless, and it works through all tests before reporing back to user.

### 5.4 `/act:heal` — run, triage, repair, report

**Purpose**: re-green a suite that fails because the UI drifted.

**Flow**
1. Run the suite via Playwright (`npx playwright test`, captured output + traces).
2. Partition results:
   - **Passed** — nothing to do.
   - **Passed on retry (flaky)** — include in report as flaky, no action.
   - **Failed** — proceed to triage.
3. For each failure, dispatch a triage subagent that:
   - Reads the test's `@act` docstring (source of truth for intent).
   - Reads the current test body.
   - Inspects Playwright's failure trace/error.
   - Launches Playwright MCP, navigates the app, and determines:
     - **Real app bug** — app doesn't match intent. No code change. Flag as "App bug suspected" with evidence.
     - **UI drift** — intent still matches the app; locators/selectors changed. Rewrite the `test()` body in place. Re-run the single test; if green, flag as "Healed"; if still red, escalate.
     - **Ambiguous** — cannot confidently decide between the two.
     - **Unhealable** — drift-looking, but rewrite attempts don't produce a green run.
4. If any failures are **Ambiguous** or **Unhealable**, **block** and surface them to the user interactively before producing a final report. The user's job is to push each into real-bug-confirmed or here's-the-fix. The user may accept a partial report if they want to stop early.
5. Produce the final report (§5.5).

**Mandatory re-run policy**: every rewritten test is re-run in isolation. No test is reported "Healed" without a green re-run.

**Scope of heal edits**

Default: heal edits **only the `test()` call body** for a failing test.

Heal **may propose** changes to the `@act` docstring when intent and UI have co-evolved — e.g. a stale hint referencing an old button label, an assertion phrased against a renamed feature, a goal that needs rewording after a legitimate product change. Such proposals are **always interactive**: heal surfaces the proposed docstring edit to the user, explains why, and waits for explicit approval before writing it. Silent docstring edits are not allowed.

Heal does **not** modify:
- Passing tests. Heal only acts on tests that are currently failing.
- Sibling `test()` calls in the same file.
- Imports, fixtures, helpers, or anything at file scope — unless strictly required (e.g. adding a locator import). In such cases, the diff is flagged in the report.

### 5.5 Heal report format

The heal report is the skill's final message in the user's chat. **Not** written to a file in v1.

Structure:

```markdown
## ActRight heal report — 2026-04-17

**Summary**: 42 tests ran — 38 pass, 2 flaky, 1 healed, 1 app bug.

### Healed (1)
- `tests/act/login.spec.ts` › `valid credentials` — sign-in button locator changed from text to role-based. Diff in working tree.
  ```diff
  - await page.getByText('Sign in').click();
  + await page.getByRole('button', { name: 'Sign in' }).click();
  ```

### App bugs suspected (1)
- `tests/act/checkout.spec.ts` › `pay with valid card` — submit button does nothing after entering a valid card. Reproduced in Playwright MCP; trace at `test-results/.../trace.zip`.

### Flaky (2)
- `tests/act/search.spec.ts` › `empty query` — failed once, passed on retry.
- `tests/act/search.spec.ts` › `unicode query` — failed once, passed on retry.

### No action (38 passing)

Would you like to commit the healed test?
```

Code changes land in the working tree (not auto-committed). Per-entry evidence (diff, trace link, error excerpt) is inline. Ask if the user wants the agent to commit.

### 5.6 `/act:discover` (designed-for; not in v1)

Designed-for so we don't block it:
- Reads the codebase; proposes a set of tests.
- Output is markdown drafts the user approves, then `/act:new` is invoked per test.
- Relies on the same docstring convention — discovery writes `@act` docstrings.

### 5.7 Helper scripts bundled with skills

Agent skills can ship helper scripts alongside their markdown. When a skill needs a capability that's awkward from the agent's native tools — e.g. parsing TypeScript to enumerate fixtures, walking ASTs to locate `@act` docstrings reliably, any structured project introspection — the skill includes a small TypeScript script and instructs the agent to run it (via `npx tsx` or equivalent). The agent invokes the script, reads JSON back, and proceeds.

**Why this, not an MCP server**
- Simpler distribution: the script travels with the skill.
- Full TypeScript Compiler API access for real AST work (no regex heuristics).
- One-shot: no server lifecycle, no IPC.
- Inspectable and debuggable like any other source file.
- Lower barrier for adding new helpers as needs emerge.

**Conventions**
- Scripts live in the skill's `scripts/` directory.
- Scripts are self-contained TypeScript, runnable via `npx tsx <script>.ts` from the project root.
- Scripts read from the project (fixture files, test files, `playwright.config.ts`) and write **structured JSON** to stdout. No side effects on project files.
- Skill markdown documents which script to invoke for which need.

**Anticipated v1 scripts** (illustrative — exact list grows as heal/authoring/setup need them)
- `list-fixtures.ts` — TS Compiler API walk of the project's fixtures file(s); returns JSON of fixture names, types, docstrings.
- `list-act-tests.ts` — enumerate `*.spec.ts` files containing `/* @act` docstrings; return per-test metadata (file, test name, docstring text, line range).
- `get-act-doc.ts <file> <test-name>` — extract a specific test's `@act` docstring parsed into its markdown sections.

## 6. Fixtures

Fixtures are ordinary **Playwright Test fixtures** (TypeScript). Act does not invent a fixture system. Composition, lifecycle, parameterization are all Playwright's.

### 6.1 How the docstring references fixtures

Both directions are supported:

1. **Named in the docstring** — under `## Fixtures`, the author lists fixture names (possibly with arguments): `- seed_user(alice@example.com)`. The authoring agent wires these into the test signature or body.
2. **Added by the agent without explicit mention in the docstring** — e.g. when a hint implies a logged-in state. The written test body is ground truth for what actually runs.

Neither direction is authoritative on its own. The docstring says what the *author* wanted. The test body is what *runs*. Drift between them is a signal a future `act doctor` command can surface; it's not an error in v1.

### 6.2 Fixture introspection

**Playwright itself does not expose fixture listing.** There is no `playwright list-fixtures` command; fixtures are pure TypeScript defined via `test.extend({...})`. Listing means reading and parsing code.

**v1 approach**: a bundled helper script, `list-fixtures.ts`, that the agent runs when it needs to know what fixtures exist. The script uses the **TypeScript Compiler API** to walk the project's fixtures file, identify `test.extend({...})` calls, and emit structured JSON (name, type, docstring) for each fixture. See §5.7 for the bundled-scripts mechanism.

No fixture-declaration convention is required of authors — the TS Compiler API handles whatever shape `test.extend` takes.

## 7. Configuration

**Principle**: reuse `playwright.config.ts`. Don't invent a parallel config file.

Everything a user might want to configure is already Playwright's concern:
- `baseURL`, `webServer` → server lifecycle.
- `testDir`, `testMatch` → where tests live.
- `workers`, `retries`, `timeout` → parallelism, flake handling.
- `use` → browser, viewport, storage, etc.
- `projects` → multi-browser, multi-env.
- Reporters → CLI, JSON, JUnit, HTML.

**Act-specific config**: none is required in v1. If a need arises for a skill-read value that doesn't map to a Playwright field (e.g. a fixture-file path hint, agent-behavior flag, future multi-agent metadata), it's fine to add a small `act` section in `playwright.config.ts` — or a sibling file — rather than invent a whole new config system. Preference: no new file if one isn't needed; if one is needed, colocate with `playwright.config.ts`.

## 8. CLI Surface

There is no act CLI. The user runs Playwright directly:

- `npx playwright test` — run the whole suite.
- `npx playwright test <path>` — run specific file(s).
- `npx playwright test --ui` — Playwright's UI mode.

Exit codes are Playwright's:
- `0` — all tests passed (flakes that passed on retry still count as pass).
- `1` — one or more tests failed.
- `2`+ — Playwright's tool errors.

Skill-reported tool failures (e.g. `/act:heal` couldn't reach Playwright MCP) are surfaced in the skill's chat output, not via a process exit code — skills don't own exit codes.

## 9. Kiln Verification

v1 ships verified against **Kiln (SvelteKit)** as the reference target. The verification is:
- `/act:setup` succeeds against Kiln.
- At least one real Kiln test authored via `/act:new` and committed.
- `/act:heal` successfully heals at least one simulated UI drift on Kiln.

Other frameworks (Next, Vite, Nuxt, Remix, Astro, non-JS backends behind a dev server) are expected to work because nothing act does depends on framework specifics — only on "a URL serves an app" and "Playwright can drive a browser at it." They are not a release gate for v1.

## 10. Edge Cases & Error Handling

| Situation | Behavior |
|---|---|
| Test body fails immediately after `/act:new` writes it | `/act:new` iterates: diagnose, rewrite body, or ask user to clarify docstring. Does not silently declare success. |
| Dev server not running during `/act:new` | Detect, prompt to start, or auto-start via Playwright's `webServer` config if defined. |
| Fixture named in docstring doesn't exist | Skill asks the user to create, substitute, or drop. Does not proceed with a nonexistent reference. |
| `@act` docstring present but no `test()` below it | Treated as malformed. Skill asks the user to write the test (via `/act:new`) or delete the dangling docstring. |
| Hand-edited test body between heal runs | Not a heal concern. Heal only acts on failing tests; a passing hand-tuned body is left alone. If the hand-tuned body is the one that's failing, heal triages and rewrites it like any other failure (§5.4). |
| Heal runs while an authoring session is in progress on the same file | v1: simple serialization — one skill at a time per file. |
| Playwright retry greens a flake | Reported as flaky in the heal report; exit code unchanged (0). |
| Heal encounters ambiguous or unhealable failure | Interactive prompt before final report. User triages each. |
| User interrupts mid-heal | Partial progress preserved (already-rewritten tests remain); no rollback. Skill can resume on next invocation. |
| `/act:setup` run twice | Idempotent: detects what already exists (Playwright install, config, MCP registration, example test) and skips. Does not overwrite an existing Playwright config or the example test. |
| Multiple `@act` docstrings separated by blank lines from their `test()` calls | Malformed. Skill reports which ones are orphaned. Heal does not act on them. |
| Markdown-less docstring (just `/* @act\n*/`) | Skill treats as "author wants an act-managed test but hasn't written intent yet." `/act:new` can fill it in; heal leaves it alone. |
| Coding agent ≠ Claude | v1 only installs for Claude. Other agents: skills will probably work (they're just markdown); MCP registration is agent-specific; `/act:setup` refuses non-Claude agents in v1 with a clear message. |

## 11. Scope Summary

**In v1**
- Skills: `/act:new`, `/act:heal`, `/act:setup`
- Docstring convention (`/* @act … */` above `test()`)
- Bundled helper scripts for project introspection (§5.7)
- Claude Code as the supported agent
- Kiln (SvelteKit) as verified target

**Designed-for, deferred**
- `/act:discover`
- CI-triggered heal
- Structured (machine-readable) heal output
- Other coding agents (Cursor, Codex, OpenCode, …)
- Other browsers (WebKit, Firefox)

**Out**
- Runtime LLM of any kind
- Parallel / competing test runner, fixture system, browser driver
- Visual / snapshot testing
- Non-UI test modes
- Act framework npm package
- Act CLI binary

## 12. Open Questions

None at this time. Planning-stage questions resolved; distribution and skills-package layout settle at architecture time.
