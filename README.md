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

ActRight is an [agent skill](https://agentskills.io) that writes, heals, and manages UI automation tests using Playwright.

 - **Thesis:** the AI should author and repair your tests, but never be in the loop when they run. Existing AI testing tools run an agent on every test execution -- that's slow, expensive, non-deterministic, and unfit for CI.
 - **Intent vs Code:** each test's intent is captured in a Markdown docstring above each test. The code body is a build artifact: an agent can regenerate or repair it when the UI changes, using the docstring as intent. This makes tests cheap to run on every commit, easy to read and review, and easy to heal when UI changes.
 - **Thin:** Act Right is simply an agent skill and convention for documenting intent. The code it produces is vanilla Playwright automation code.
 - **Easy to use:** Just type `/act setup` to your agent, and Act Right will bootstrap your UI automation testing process.

## Example: Code generated from Intent

```ts
import { test, expect } from '@playwright/test';

/* @act
## Goals
User with valid credentials signs in from the homepage and lands on the dashboard.

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

The `/* @act ... */` docstring is the source of truth. The test body below it is generated code -- the agent writes it, `/act heal` rewrites it when the UI drifts.

## Skills Reference

| Skill Commands | Purpose |
|---|---|
| <code>/act&nbsp;setup</code> | One-time project bootstrap. Installs Playwright, registers MCP, configures `webServer`/`baseURL`, scaffolds example tests. See [references/setup.md](skill/references/setup.md). |
| <code>/act&nbsp;new</code>` | Interactive test authoring. Drafts the docstring with you, explores the app via Playwright MCP, generates and verifies the test body. See [references/new.md](skill/references/new.md). |
| <code>/act&nbsp;heal</code>` | Run, triage, repair, report. Classifies failures as UI drift vs. app bug, rewrites broken test bodies, re-runs to confirm. See [references/heal.md](skill/references/heal.md). |

## Install

```sh
# Clone this project (not inside your project)
git clone --depth 1 https://github.com/scosman/ActRight.git

# Symlink the skill subdirectory for Claude to discover
ln -s ActRight/skill ~/.claude/skills/actright
```

After installing, `/act setup`, `/act new`, and `/act heal` are available inside Claude Code.

**Update later:** `git pull` from ActRight directory -- the symlink picks it up updates automatically.

<details>
<summary><strong>Cursor, VSCode, OpenCode and Others</strong></summary>

ActRight works with any coding agent which supports [agent skill](https://agentskills.io).

| Target | Install |
|---|---|
| Claude Code (one project only) | Instead of installing into `~/.claude`, install into `PROJECT_ROOT/.claude/skills/`. |
| Cursor | link to `~/.cursor/skills/` for global install or `PROJECT_ROOT/.cursor/skills/` for project-specific install. |
| VS Code (GitHub Copilot) | Reads `.claude/skills/` natively -- the main install works as-is. Also searches `.github/skills/` and `.agents/skills/`. |
| OpenCode | Reads `.claude/skills/` natively -- the main install works as-is. Also searches `.opencode/skills/`. |
| Others | Check their Skills documentation for install path. |

</details>

## Quickstart

### Prerequisites

- Node 20+
- A project with a running dev server (any framework/language -- SvelteKit, Next.js, Go, Python, etc.)

### Step A: Bootstrap

```
/act setup
```

Walks you through installing Playwright, registering Playwright MCP, configuring your dev server, and scaffolding an example test. Detects what already exists and skips it.

### Step B: Author a test

```
/act new
```

Draft a plain-English description, explore the app in a headed browser via Playwright MCP, and generate a matching test body. Iterate until green.

### Step C: Run the suite

```sh
npm run test:e2e   # or: npx playwright test
```

No AI, no LLM, no network calls beyond your app. Same Playwright you already know.

### Step D: Heal broken tests

```
/act heal
```

Runs the suite, triages each failure, and rewrites broken test bodies where the UI has drifted. The docstring (your intent) stays untouched; only generated code changes. You get back a report splitting failures into **UI drift -- healed** vs. **likely app bug -- needs your attention**, so legitimate regressions don't quietly get papered over.

## The Docstring Convention

Each act-managed test carries a `/* @act ... */` block comment immediately above its `test()` call.

**Suggested sections:** Goals, Fixtures, Hints, Assertions. Use what's relevant; none are required. Content is freeform markdown.

For full rules, see [references/docstring.md](skill/references/docstring.md) and [functional spec section 3](specs/projects/act_right_v1/functional_spec.md#3-docstring-convention-the-central-design).

## License

[MIT](LICENSE)
