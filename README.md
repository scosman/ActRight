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

| Skill | Purpose |
|---|---|
| `/act setup` | One-time project bootstrap. Installs Playwright, registers MCP, configures `webServer`/`baseURL`, scaffolds example tests. See [references/setup.md](skill/references/setup.md). |
| `/act new` | Interactive test authoring. Drafts the docstring with you, explores the app via Playwright MCP, generates and verifies the test body. See [references/new.md](skill/references/new.md). |
| `/act heal` | Run, triage, repair, report. Classifies failures as UI drift vs. app bug, rewrites broken test bodies, re-runs to confirm. See [references/heal.md](skill/references/heal.md). |

## Install

```sh
# Clone into your project's skills directory
git clone --depth 1 https://github.com/scosman/act_right.git .claude/skills/act_right.git

# Symlink the skill subdirectory
ln -s act_right.git/skill .claude/skills/actright
```

The skill lives in the repo's `skill/` subdirectory; the rest is dev tooling.

After installing, `/act setup`, `/act new`, and `/act heal` are available inside Claude Code.

**Update later:** `git -C .claude/skills/act_right.git pull` -- the symlink picks it up automatically.

<details>
<summary><strong>Other agents & install targets</strong></summary>

ActRight is an [agent skill](https://agentskills.io) — it loads on demand based on the task, rather than sitting in context like a rule. That means it drops into any agent that speaks the skill standard:

| Target | Install |
|---|---|
| Claude Code (global) | Clone to `~/.claude/skills/act_right.git` and symlink `~/.claude/skills/actright` → `act_right.git/skill`. |
| Claude Code (team-shared) | Use the main install above and commit `.claude/skills/` to your repo. |
| VS Code (GitHub Copilot) | Reads `.claude/skills/` natively -- the main install works as-is. Also searches `.github/skills/` and `.agents/skills/`. |
| OpenCode | Reads `.claude/skills/` natively -- the main install works as-is. Also searches `.opencode/skills/`. |

**Rules-based agents (Cursor, Windsurf, etc.)** don't support skills natively -- rules are always-on; skills load conditionally. A rule adapter isn't shipped yet.

</details>

## Quickstart

### Prerequisites

- Node 20+
- A project with a running dev server (any framework -- SvelteKit, Next.js, Vite, Go, etc.)

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
