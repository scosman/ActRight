```
 █████╗  ██████╗████████╗    ██████╗ ██╗ ██████╗ ██╗  ██╗████████╗
██╔══██╗██╔════╝╚══██╔══╝    ██╔══██╗██║██╔════╝ ██║  ██║╚══██╔══╝
███████║██║        ██║       ██████╔╝██║██║  ███╗███████║   ██║   
██╔══██║██║        ██║       ██╔══██╗██║██║   ██║██╔══██║   ██║   
██║  ██║╚██████╗   ██║       ██║  ██║██║╚██████╔╝██║  ██║   ██║   
╚═╝  ╚═╝ ╚═════╝   ╚═╝       ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝  
```

## What is ActRight
[![CI](https://github.com/scosman/ActRight/actions/workflows/ci.yml/badge.svg)](https://github.com/scosman/ActRight/actions/workflows/ci.yml)

ActRight is an [agent skill](https://agentskills.io) that will write, heal, and manage UI automation tests using Playwright.

 - **Thesis:** the AI should author and repair your tests, but never be in the loop when they run. Existing AI testing tools run an agent on every test execution -- that's slow, expensive, non-deterministic, and unfit for CI.
 - **Intent vs Code:** each test's intent is captured in a new Markdown docstring above each test. The code body of the test is a build artifact: an agent can regenerate or repair it when the UI changes, using the docstring as intent. This makes tests cheap to run on every commit, easy to read and review, and easy to heal/repair when UI changes.
 - **Thin:** Act Right is simply an agent skill and convention for documenting intent. The code it produces is vanilla Playwright automation code. 
 - **Easy to use:** Just type `/act setup` to your agent, and Act Right wil bootstrap your UI automation tessing process.

## Quickstart

### Prerequisites

- Node 20+
- A project with a running dev server (any framework/language -- SvelteKit, Next.js, Vite, Go, etc.)

### Step A: Install act skills

```sh
# Clone the repo to an adjacent location
git clone --depth 1 https://github.com/scosman/act_right.git .claude/skills/act_right.git

# From project root, link the skill subdir to where Claude Code looks for skills
ln -s act_right.git/skill .claude/skills/actright
```

The skill is packaged inside the repo's `skill/` subdirectory -- the rest of the repo (tests, dev tooling, docs) doesn't need to live inside the agent's skills directory.

**Updating act later:**

```sh
git -C .claude/skills/act_right.git pull
```

The symlink picks up the update automatically.

**Windows or environments without symlinks:** copy the directory instead:

```sh
cp -r .claude/skills/act_right.git/skill .claude/skills/actright
```

Note: copying means you need to re-copy after each `git pull`.

After installing, `/act setup`, `/act new`, and `/act heal` are available inside Claude Code.

**Other install targets:**

- **Claude Code global:** clone into `~/.claude/skills/act_right.git` and symlink `~/.claude/skills/actright` to `act_right.git/skill` to make skills available across all projects.
- **Project-local (team-shared):** install as above and commit the directory so every team member gets the skills.
- **Cursor, Windsurf, and other agents:** community-supported -- drop the `skill/` directory contents into whichever directory your agent scans for skills or rules.

### Step B: Bootstrap your project

Inside Claude Code, run:

```
/act setup
```

This walks you through installing Playwright, registering Playwright MCP, configuring your dev server, and scaffolding an example test. It detects what already exists and skips anything that's already wired up.

### Step C: Author your first test

```
/act new
```

The skill works with you interactively: draft a plain-English description of what the test should do, explore the app in a headed browser via Playwright MCP, and generate a matching Playwright Test body. Iterate until the test is green.

### Step D: Run the suite

```sh
npx playwright test
```

Tests run deterministically. No AI, no LLM, no network calls beyond your app. Same Playwright you already know.

### Step E: Heal broken tests

When the UI changes and tests break:

```
/act heal
```

Heal runs the suite, triages each failure (UI drift vs. real app bug), rewrites broken test bodies in place, re-runs to confirm, and reports results. The docstring (your intent) stays untouched; only the generated code changes.

## How It Works

ActRight separates test lifecycle into two phases. At **author time**, an AI agent (running in Claude Code) works with you to write a plain-English description of each test and generates a matching Playwright Test body. The agent uses Playwright MCP to drive a real browser, find the right locators, and verify the test passes. At **run time**, it's pure Playwright -- `npx playwright test`, no AI involved, fully deterministic.

When the UI drifts and tests break, `/act heal` brings the AI back in to triage failures and rewrite test bodies. The English docstring is the stable source of truth; the code body is regenerated to match the current UI. Review is just the diff.

## The Docstring Convention

Each act-managed test carries a `/* @act ... */` block comment immediately above its `test()` call. This docstring is the source of truth for the test's intent.

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

The body below the docstring is generated code -- the agent writes it, and `/act heal` rewrites it when the UI drifts. The docstring stays stable.

**Suggested sections:** Goals, Fixtures, Hints, Assertions. Use what's relevant; none are required. The docstring content is freeform markdown.

For full rules, see [references/docstring.md](skill/references/docstring.md) and [functional spec section 3](specs/projects/act_right_v1/functional_spec.md#3-docstring-convention-the-central-design).

## Skills Reference

| Skill | Purpose |
|---|---|
| `/act setup` | One-time project bootstrap. Installs Playwright, registers Playwright MCP, configures `webServer`/`baseURL`, scaffolds example tests and fixtures. See [references/setup.md](skill/references/setup.md). |
| `/act new` | Interactive test authoring. Drafts the docstring with you, explores the app via Playwright MCP, generates and verifies the test body. See [references/new.md](skill/references/new.md). |
| `/act heal` | Run, triage, repair, report. Runs the suite, classifies failures as drift vs. app bug, rewrites broken test bodies, re-runs to confirm, and prints a heal report. See [references/heal.md](skill/references/heal.md). |

## Helper Scripts

Bundled TypeScript scripts that skills use for project introspection. You don't need to run these yourself -- the skills invoke them automatically. Listed here for reference.

| Script | Description |
|---|---|
| `skill/scripts/list-fixtures.ts` | Enumerates Playwright fixtures via the TS Compiler API. Returns fixture names, types, docstrings, and dependencies as JSON. |
| `skill/scripts/list-act-tests.ts` | Finds all `@act`-managed tests across the project. Returns per-test metadata (file, name, docstring, line range) plus orphan detection. |
| `skill/scripts/get-act-doc.ts` | Extracts a single test's `@act` docstring by file path and test name. Returns parsed sections as JSON. |

For script contracts and invocation details, see [architecture section 4](specs/projects/act_right_v1/architecture.md#4-helper-scripts).

## Troubleshooting

**Playwright MCP isn't responding.**
Check that Playwright MCP is registered in `.mcp.json` (or `.claude/mcp.json`). Re-run `/act setup` to re-register it.

**Dev server didn't start.**
Check the `webServer.command` in your `playwright.config.ts`. Make sure the command actually starts your app. If you prefer to run the dev server manually, set `reuseExistingServer: true` in the `webServer` block.

**Fixture named in docstring doesn't exist.**
`/act new` will ask you to pick from existing fixtures or drop the reference. Run `npx tsx skill/scripts/list-fixtures.ts --cwd .` to see what's available.

**Test body fails after `/act new` wrote it.**
The skill iterates automatically -- it diagnoses and rewrites. If it gives up, verify the dev server state, check that the docstring's intent matches the current app, and retry.

**Heal reported ambiguous or unhealable.**
These are surfaced interactively for you to triage. Decide whether the failure is a real app bug (fix the app) or whether the test needs a different approach (clarify the docstring and re-author with `/act new`).

**`npx tsx` can't find TypeScript.**
Run `npm install` in your project. Act's helper scripts resolve `typescript` from your project's `node_modules`.

## What's NOT in v1

- No runtime LLMs -- tests run with zero AI involvement.
- No parallel or competing test runner -- just Playwright.
- No visual or snapshot testing.
- No `act` CLI binary.
- No `act-framework` npm package -- tests import from `@playwright/test` only.
- No published npm distribution -- install via `git clone` only.
- No `/act discover` (cold-start suite generation) -- designed-for, deferred.
- No CI-triggered heal -- heal runs locally via Claude Code.
- No multi-agent support -- Claude Code only in v1.

## Contributing / Development

This section is for contributors to ActRight itself. End users of act skills never need to do this.

```sh
npm install
npm test
npm run lint
```

Tests use vitest and cover the helper scripts in `skill/scripts/`. Formatting uses prettier (`npm run format:check` to verify, `npm run format` to fix).

## License

[MIT](LICENSE)
