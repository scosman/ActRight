# /act setup

## Purpose

Take a project from "nothing act-specific here" to "I can author a test." `/act setup` owns only the act-side glue and otherwise delegates to Playwright. Source: functional spec SS5.2, architecture SS5.1.

## When to use

- First time using act in a project, after cloning act into `.claude/skills/actright` (SS5.1).
- Re-running after a partial or skipped previous setup (idempotent — skips what's already done).

## When NOT to use

- The project already has a working act + Playwright + MCP setup and passing sanity tests. Run `/act new` instead.
- You want to create a brand-new project from scratch. Act installs into existing projects, not greenfield.

## Before you start

- Load `references/subagents.md` now.
- Load `references/fixtures.md` now.
- Load `references/docstring.md` now.
- Identify `$SKILL_DIR` — the directory where act is installed (e.g. `.claude/skills/actright`). All script paths are relative to this.
- Identify `$PROJECT_DIR` — the user's project root (working directory).

## Flow

Follow these steps in order. Each step checks for existing state and skips if already satisfied.

### Step 1: Detect existing state

Read the project to understand what already exists:

- **`package.json`** — confirm it exists. If not, stop: "This project has no `package.json`. Initialize one first (`npm init`)."
- **`@playwright/test`** — check if installed (look in `node_modules/@playwright/test` or `package.json` dependencies/devDependencies).
- **`playwright.config.ts`** (or `.js`) — check if it exists. If it does, read it and note:
  - Whether `use.baseURL` is set.
  - Whether `webServer` is configured.
  - What `testDir` is set to (default: `tests`).
- **`.mcp.json`** — check if it exists and whether it already contains a Playwright MCP entry.
- **`package.json` scripts** — look for entries named `dev`, `start`, `preview`, or similar that look like a dev server command.
- **`test:e2e` script** — check if `package.json` already has a `test:e2e` script, or any script whose command already invokes `playwright test`.

Report what you found to the user before proceeding.

### Step 2: Interactive prompts

Ask the user which coding agent they use.

- If they answer **Claude** (or Claude Code), proceed.
- If they answer anything else, respond: "ActRight v1 supports Claude Code only. Support for other agents is planned for a future release." Then stop.
- In v1, skip this prompt if you already know you are running inside Claude Code (you are). Mention that v1 is Claude-only and move on.

### Step 3: Install Playwright (if needed)

If `@playwright/test` is already installed, tell the user and skip to Step 4.

Otherwise, prepare the `npm init playwright@latest` command with detected arguments:

- `--quiet` — suppress interactive prompts from Playwright's installer.
- `--lang=ts` — default. If the project has no `tsconfig.json` and no `.ts` files, use `--lang=js` instead.
- `--browser=chromium` — install only Chromium to keep setup fast.
- `--gha` — include only if `.github/workflows/` directory exists.

**Present the full command to the user** with the detected arguments. Explain each argument briefly. Ask the user to confirm or edit before running. Then run it.

If the command fails, surface the full stderr to the user and stop. Do not retry automatically.

### Step 4: Add `test:e2e` script to `package.json`

If `package.json` already has a `test:e2e` script whose command is `playwright test`, skip silently.

If `package.json` has a `test:e2e` script with a **different** command, or any other script whose command already invokes `playwright test`:
- Report what exists (script name and command).
- Ask the user whether to replace or leave it as-is.
- Do NOT overwrite without confirmation.

Otherwise, add the following entry to the `scripts` object in `package.json`:

```json
"test:e2e": "playwright test"
```

No `npx` prefix — npm/yarn/pnpm scripts resolve locally installed binaries automatically.

### Step 5: Install and register Playwright MCP

Check `.mcp.json` for an existing Playwright MCP entry. If present, skip.

Otherwise:

1. Install `@playwright/mcp` as a project-local dev dependency if not already present: `npm install --save-dev @playwright/mcp`.
2. Add the Playwright MCP server entry to `.mcp.json`. Create the file if it does not exist. The entry should use the standard MCP server configuration for `@playwright/mcp` so Claude Code can use Playwright browser tools.

Show the user the `.mcp.json` changes before writing.

### Step 6: Scaffold install-verification test

Check if a file named `act_sanity.spec.ts` already exists in the project's `testDir`. If it does, skip.

Otherwise:

1. Copy `$SKILL_DIR/examples/sanity.spec.ts` to `<testDir>/act_sanity.spec.ts`.
2. Run the test immediately: `npx playwright test <testDir>/act_sanity.spec.ts`.
3. On green: report success — the act + Playwright + MCP stack works.
4. On red: surface the error. Most likely cause is Playwright not installed correctly or browsers not downloaded. Help the user debug. Do not proceed until this test passes.

### Step 7: Configure webServer and baseURL

If `playwright.config.ts` already has both `webServer` and `use.baseURL` set, tell the user and skip to Step 8.

If the user explicitly opts out ("I'll wire up `webServer` myself later"), record the skip and proceed to Step 8. Offer to complete this step on any re-run.

Otherwise, walk the user through configuring both:

1. **`webServer.command`** (required) — the shell command that starts the app.
   - Detect from `package.json` scripts: look for `dev`, `start`, `preview` (in that order of preference).
   - If detected, propose it. If not, ask the user.
   - No command means no `webServer` config — surface this clearly.

2. **`webServer.url`** — the URL Playwright polls to know the server is ready.
   - Propose a sensible default based on the detected stack:
     - Vite / SvelteKit → `http://localhost:5173`
     - Next.js → `http://localhost:3000`
     - Create React App → `http://localhost:3000`
     - Remix → `http://localhost:3000`
     - Astro → `http://localhost:4321`
     - Generic / unknown → `http://localhost:3000`
   - Let the user confirm or edit.

3. **`use.baseURL`** — same as `webServer.url` by default.

4. **`webServer.reuseExistingServer`** — default `false`. Explain: "Playwright will start a fresh server for each test run. If you prefer to reuse a running dev server, you can change this to `true` later."

5. **`webServer.timeout`** — mention Playwright's default (60s). Surface it so the user can bump for slow boots.

Present the full `webServer` block and `use.baseURL` value to the user. After confirmation, write them into `playwright.config.ts`.

**Never overwrite existing `webServer` or `baseURL` config.** If they are already set, skip entirely.

### Step 8: Scaffold an "app loads" sanity test

Only proceed if Step 7 completed (webServer is configured).

1. Draft a minimal `@act` test that:
   - Navigates to `/`.
   - Asserts the page has a title or a visible landmark (heading, main content area).
   - Uses no authentication or fixtures.
   - Has a proper `/* @act ... */` docstring.

2. Write it to `<testDir>/act_app_loads.spec.ts` (skip if this file already exists).

3. Run it: `npx playwright test <testDir>/act_app_loads.spec.ts`.
   - Playwright will start the dev server via `webServer.command`.
   - On green: the full stack is verified end-to-end.
   - On red: surface the error. Most likely the dev-server command or baseURL is wrong. Help the user edit `playwright.config.ts` and retry interactively.

### Step 9: Scaffold core fixtures (interactive)

Only proceed if Step 8 passed.

Ask the user: "Does your app have reusable setup states that tests will need? Common examples: sign up, log in, create project, seed data. Name the ones you want to scaffold now, or skip."

If the user skips, proceed to Step 10.

Before scaffolding, list existing fixtures by running `npx tsx --cwd "$SKILL_DIR" "$SKILL_DIR/scripts/list-fixtures.ts" --cwd "$PROJECT_DIR"`. If a user-named fixture already exists in the output, skip it and tell the user it is already scaffolded.

For each named fixture that does not already exist:

1. **Explore the codebase.** Spawn an `explore_code` subagent (read `references/subagent_explore_code.md`, fill `{{GOAL}}` with a question like "How does this app handle [fixture name]? What are the UI paths and form fields for [signup/login/etc.]?", fill `{{CONTEXT.starting_paths}}` with relevant directories, fill `{{CONTEXT.fixture_hints}}` with the fixture name).

2. **Draft the fixture.** Using the subagent's findings, write a Playwright Test fixture (`test.extend({...})`) in the project's fixtures file. Create the file at `<testDir>/fixtures.ts` if it does not exist. Show the fixture code to the user for approval.

3. **Draft a sanity test.** Write one `@act` test that exercises the fixture and makes a simple assertion (e.g. `logged_in` fixture → navigate to a logged-in-only page, assert it rendered). Follow the docstring convention from `references/docstring.md`.

4. **Run the sanity test.** `npx playwright test <file> -g <test-name>`.
   - On green: the fixture is confirmed working.
   - On red: iterate — this is the same loop as `/act new` (SS5.3). Diagnose the failure, adjust the fixture or test, and re-run. If the fixture involves browser interaction, spawn `explore_app` in author mode to find the correct action sequence.

5. **Report** what was scaffolded for this fixture before moving to the next.

If the user partially completes (stops midway), record what was done and what is pending. A re-run of `/act setup` picks up from where it left off.

### Step 10: Print "next steps"

Summarize to the user:

```
## Setup complete

**Sanity tests passed:**
- act_sanity.spec.ts (install verification) ✓
- act_app_loads.spec.ts (app loads) ✓  [if step 8 ran]

**Fixtures scaffolded:**
- [list each fixture name and its sanity test status]  [if step 9 ran]

**Next steps:**
- Run all tests: `npm run test:e2e` (or `npx playwright test`)
- Author a new test: `/act new <description>`
- Heal failing tests after UI changes: `/act heal`
```

## Subagent usage

This mode uses one subagent type:

- **`explore_code`** — spawned in Step 9 when scaffolding fixtures, to understand how the app implements each fixture's precondition (auth routes, signup forms, API endpoints, etc.). Read `references/subagent_explore_code.md`, fill `{{GOAL}}` and `{{CONTEXT.*}}`, and spawn via the Agent tool.

If fixture scaffolding involves browser interaction (sanity test red, need to find correct sequence), also spawn:

- **`explore_app`** (author mode) — to find the click/fill sequence for a fixture's sanity test. Same pattern as `/act new`.
- **`code_task`** (write_new) — to write the fixture's sanity test from the action sequence.

See `references/subagents.md` for the spawn mechanic and manager discipline rules.

## Edge cases

| Situation | Behavior |
|---|---|
| No `package.json` | Stop immediately. Tell the user to initialize one. |
| Coding agent is not Claude | Refuse politely: "ActRight v1 supports Claude Code only." Stop. |
| Playwright already installed | Skip Step 3. Report what version is installed. |
| `playwright.config.ts` already exists | Do NOT overwrite. Read it for detection; skip any config steps that are already satisfied. |
| `webServer` + `baseURL` already set | Skip Step 7 entirely. |
| Example test files already exist | Skip scaffolding those files. Do not overwrite. |
| `npm init playwright@latest` fails | Surface full stderr. Stop. User fixes and re-runs. |
| Sanity test fails (Step 6) | Surface error. Help debug. Do not proceed until green. |
| App-loads test fails (Step 8) | Surface error. Most likely webServer command or baseURL is wrong. Help user edit and retry. |
| Fixture sanity test fails (Step 9) | Iterate using the `/act new` loop: diagnose, adjust, re-run. |
| User skips webServer config | Record the skip. Offer again on re-run. Steps 8-9 are skipped. |
| `/act setup` run a second time | Idempotent. Detect what exists and skip. Never overwrite existing config, tests, or fixtures. |
| `.mcp.json` doesn't exist | Create it with just the Playwright MCP entry. |
| No dev/start/preview script in package.json | Ask the user for the dev server command. If none, surface clearly — webServer cannot be configured without a command. |

## Reporting

At the end, print the Step 10 summary. This is the final output — do not ask further questions after the summary unless the user continues the conversation.
