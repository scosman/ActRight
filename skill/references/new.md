# /act new

## Purpose

Take a new test from blank-slate to committed, runnable, green. The user describes what they want tested; you converge on a docstring, explore the app, write the test, and iterate until it passes. Source: functional spec SS5.3, architecture SS5.2.

## When to use

- User wants to author a new act-managed Playwright test.
- User invokes `/act new` with an optional seed description.

## When NOT to use

- Tests are already written and failing — use `/act heal` instead.
- Project has no Playwright setup — use `/act setup` first.
- User wants to bulk-discover tests for a feature — designed-for in v1+ (`/act discover`). Use `/act new` for individual tests until then.

## Before you start

- Load `references/subagents.md` now.
- Load `references/docstring.md` now.
- Load `references/fixtures.md` now.
- Identify `$SKILL_DIR` — the act install directory (e.g. `.claude/skills/actright`).
- Identify `$PROJECT_DIR` — the user's project root.

## Flow

### Step 1: Parse the inline request

The router forwards the user's seed description (everything after `/act new`). Use it as the starting point for the test intent. If empty, ask the user what they want to test.

### Step 2: Read available fixtures

Run the fixtures helper script:

```sh
npx tsx --cwd "$SKILL_DIR" "$SKILL_DIR/scripts/list-fixtures.ts" --cwd "$PROJECT_DIR"
```

Parse the JSON output. You now know what fixtures are available for the user's test. Surface relevant fixtures to the user during docstring drafting.

### Step 3: Converge on a draft docstring (interactive)

Work with the user to draft the `@act` docstring. This is interactive — the user approves the docstring before you proceed.

1. From the seed description and any clarifying questions, draft a docstring with the suggested sections (SS3): `## Goals`, `## Fixtures`, `## Hints`, `## Assertions`.
2. Show the draft to the user.
3. Iterate until the user approves. Do not proceed with an unapproved docstring.

Key rules from `references/docstring.md`:
- Use `/*` delimiter, not `/**`.
- `@act` on the first line.
- Sections are markdown `##` headings.
- Goals are prescriptive — authoring and heal treat them as the source of truth.
- Assertions are binding — the test body must honor them.

If the user's intent is vague, push back with specifics. Do not write code for an ambiguous intent. Ask: "What should the test assert happened? What does success look like?"

### Step 4: Multi-test mode (if applicable)

If the user wants multiple tests around a feature (explicitly stated or implied by a broad request):

1. **Feature-browse phase.** Spawn an `explore_code` subagent to understand the feature's code and UI paths. Use the findings to suggest a set of tests covering the feature.
2. **Iterate with the user** until the test set is approved. Each test gets its own docstring (Step 3 applies per test).
3. **Ask: "Interactive or autonomous?"**
   - **Interactive**: walk through each test one at a time, with the user watching and approving at each step.
   - **Autonomous**: run headed (not headless), work through all tests sequentially, and report results at the end. The user can watch but is not prompted between tests.
4. For each test in the set, execute Steps 5-8. In autonomous mode, chain them without prompting; in interactive mode, pause between tests for user confirmation.
5. When spawning subagents for multiple tests in the set, spawn them **in parallel** where independence allows (e.g. multiple `explore_app` calls for different tests can run concurrently).

If the user wants a single test, skip this step.

### Step 5: Explore the app (author mode)

Spawn an `explore_app` subagent in author mode.

Read `references/subagent_explore_app.md`. Fill the placeholders:

- `{{GOAL}}`: "Find the click/fill sequence that matches: <the approved docstring>."
- `{{CONTEXT.base_url}}`: from `playwright.config.ts` `use.baseURL`.
- `{{CONTEXT.fixture_state_hints}}`: describe the expected app state based on fixtures named in the docstring (e.g. "Assume a logged-in user; the `loggedIn` fixture handles authentication — the app should show the dashboard when you open `/`").
- `{{CONTEXT.hints}}`: the `## Hints` section from the docstring, if present.
- `{{CONTEXT.source_excerpts}}`: if you ran `explore_code` in Step 4, include relevant excerpts. Otherwise leave empty.

Spawn the subagent via the Agent tool. Wait for its output.

Parse the subagent's response:
- **Action sequence** — the ordered list of browser actions.
- **Chosen locators** — the Playwright locators for each element.
- **Notes for manager** — review these. If the subagent flags a mismatch between the docstring and the actual UI (e.g. "the docstring says 'Sign in' but the button says 'Log in'"), surface it to the user and clarify before proceeding.

### Step 6: Write the test

Spawn a `code_task` subagent in write_new mode.

Read `references/subagent_code_task.md`. Fill the placeholders:

- `{{GOAL}}`: `write_new`
- `{{CONTEXT.target_file}}`: the absolute path to the target `.spec.ts` file. If the user specified a file, use it. Otherwise, derive from the test name and place it under `testDir` (e.g. `<testDir>/act/<feature>.spec.ts`).
- `{{CONTEXT.test_name}}`: the test name from the docstring conversation.
- `{{CONTEXT.docstring}}`: the approved `@act` docstring, verbatim with delimiters.
- `{{CONTEXT.action_sequence}}`: from the `explore_app` subagent's output.
- `{{CONTEXT.chosen_locators}}`: from the `explore_app` subagent's output.
- `{{CONTEXT.fixtures_available}}`: the JSON output from Step 2.

Spawn the subagent. Wait for its output. Review the self-check — all items must be checked.

### Step 7: Run the test

Run the test as the manager (do NOT delegate this to a subagent):

```sh
npx playwright test <file> -g "<test-name>"
```

This runs only the specific test. Playwright starts the dev server via `webServer` if configured.

### Step 8: Handle the result

**On green**: report success to the user. Include the file path and test name. Remind the user that committing is their responsibility — do NOT auto-commit.

**On red**: diagnose the failure. Classify the cause:

1. **Intent-vs-reality mismatch** — the docstring describes something the app does not actually do, or the user's intent is ambiguous. Go back to Step 3 and ask the user to clarify or update the docstring.

2. **Locator wrong** — the app has the right behavior but the locator is stale or incorrect. Re-spawn `explore_app` (Step 5) with a narrower goal: "The locator `<locator>` failed with error `<error>`. Find the correct locator for <element description>."

3. **Fixture missing** — the test references a fixture that does not exist. Ask the user:
   - Create the fixture now (switch to the fixture scaffolding loop from `/act setup` Step 9).
   - Substitute an existing fixture.
   - Drop the fixture reference from the docstring.
   Do NOT proceed with a nonexistent fixture.

4. **Dev server not running** — Playwright reports it cannot reach the app. Surface: "Is your dev server running?" If `webServer` is configured in `playwright.config.ts`, Playwright should start it automatically — check the webServer error. If `webServer` is not configured, offer to configure it (same as `/act setup` Step 7).

5. **Other failure** — surface the full Playwright error to the user. Ask for guidance.

After addressing the cause, re-run from Step 7. Iterate until green or the user decides to stop.

## Subagent usage

| Subagent | When | Purpose |
|---|---|---|
| `explore_code` | Step 4 (multi-test mode) | Understand the feature's code and UI paths before suggesting a test set. |
| `explore_app` (author) | Step 5, and Step 8 on locator failures | Find the click/fill sequence matching the docstring. |
| `code_task` (write_new) | Step 6 | Write the test from the action sequence and locators. |

For multi-test mode, spawn independent subagents in parallel (multiple Agent calls in one message). See `references/subagents.md`.

## Edge cases

| Situation | Behavior |
|---|---|
| User kills the headed browser | Clean up. Ask: "The browser was closed. Retry the exploration?" |
| Dev server not running | Surface the issue. Offer to start if `webServer` is defined in config. |
| Intent cannot be verified | Push back with specifics before writing code. "I cannot determine what success looks like. What should the test assert?" |
| Fixture named in docstring does not exist | Ask the user: create it, substitute an existing one, or drop the reference. Do NOT proceed with a nonexistent fixture. |
| `explore_app` returns ambiguous notes | Surface the ambiguity to the user. Clarify before proceeding to `code_task`. |
| `explore_app` budget exceeded | Subagent returns incomplete findings. Re-spawn with a narrower goal. If still insufficient, ask the user for hints. |
| `code_task` self-check fails | The subagent should fix it internally. If it returns with unchecked items, re-spawn once. If still failing, surface to the user. |
| Target file already has a test with the same name | Ask the user to pick a different name or a different file. |
| Multi-test autonomous mode | Run headed (not headless). Work through all tests. Report results at the end. On any failure, include it in the final report with the diagnosis. |
| User wants to stop mid-iteration | Respect it. Report what was written. Partial progress (written but red test) is left in the working tree for the user to handle. |

## Reporting

On green:

```
Test written and passing:
- File: <path>
- Test: "<test-name>"

The test is in your working tree. Commit when ready.
```

On red (after user decides to stop iterating):

```
Test written but NOT passing:
- File: <path>
- Test: "<test-name>"
- Last error: <summary>

The test is in your working tree. You can fix it manually, re-run `/act new`, or delete it.
```

For multi-test mode, report each test's status.
