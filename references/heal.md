# /act heal

## Purpose

Re-green a test suite that fails because the UI drifted. Run all tests, triage each failure, repair what can be repaired, and produce a structured report. Source: functional spec SS5.4, SS5.5, architecture SS5.3.

## When to use

- After a UI change broke existing act-managed tests.
- As a regular maintenance step: run tests, heal drift, surface real bugs.

## When NOT to use

- You want to author a new test — use `/act new`.
- Playwright is not set up — use `/act setup` first.
- You want to fix a bug in the app — heal identifies app bugs but does not fix them.

## Before you start

- Load `references/subagents.md` now.
- Load `references/docstring.md` now.
- Load `references/fixtures.md` now.
- Identify `$SKILL_DIR` — the act install directory (e.g. `.claude/skills/actright`).
- Identify `$PROJECT_DIR` — the user's project root.

## Flow

### Step 1: Run the full test suite

Run all Playwright tests with JSON reporter to capture structured results:

```sh
npx playwright test --reporter=json
```

Capture both the JSON output and the exit code. If the command fails to start at all (e.g. dev server down, port in use), surface the stderr to the user and stop. Offer to check `webServer` config.

### Step 2: Partition results

Parse the JSON reporter output. Partition every test into one of three buckets:

- **Passed** — green on first attempt. No action needed.
- **Passed on retry (flaky)** — failed at least once, then passed on a Playwright retry. Report as flaky, but take no action. These are not broken — Playwright's retry mechanism handled them.
- **Failed** — red on all attempts. These are the candidates for triage.

Report the partition summary to the user before proceeding:

```
Ran X tests: Y passed, Z flaky, W failed.
Triaging W failures...
```

If there are zero failures, skip to the final report (Step 6).

### Step 3: Triage failures (parallel)

For each failed test, you need two things before spawning the triage subagent:

1. **The `@act` docstring.** Extract it using:
   ```sh
   npx tsx --cwd "$SKILL_DIR" "$SKILL_DIR/scripts/get-act-doc.ts" <file> "<test-name>"
   ```
   If the test has no `@act` docstring, it is not act-managed. Skip it — report it under "No action" as a non-act failure.

2. **The current test body.** Read the test file and extract the test function body.

3. **The Playwright error.** Extract the error message and stack trace from the JSON reporter output. Note the trace path if available (e.g. `test-results/<test>/trace.zip`).

Now spawn an `explore_app` subagent **in triage mode** for each failure. Read `references/subagent_explore_app.md` and fill:

- `{{GOAL}}`: "Reproduce this failing test and classify: <docstring> + <test body summary> + <Playwright error excerpt>."
- `{{CONTEXT.base_url}}`: from `playwright.config.ts` `use.baseURL`.
- `{{CONTEXT.fixture_state_hints}}`: describe expected state from fixtures in the docstring.
- `{{CONTEXT.hints}}`: the `## Hints` section from the docstring, if present.
- `{{CONTEXT.source_excerpts}}`: the current test body (so the subagent can see what the test was trying to do, since it cannot read files).

**Spawn all triage subagents in parallel** — emit multiple Agent tool calls in a single message. Each failure gets its own independent subagent.

### Step 4: Collect verdicts and act

As each triage subagent returns, collect its verdict and act accordingly:

#### `drift`

The UI changed but the intent still holds. The test needs updated locators or a slightly different action sequence.

1. Spawn a `code_task` subagent in `rewrite_body` mode. Read `references/subagent_code_task.md` and fill:
   - `{{GOAL}}`: `rewrite_body`
   - `{{CONTEXT.target_file}}`: the test file path.
   - `{{CONTEXT.test_name}}`: the test name.
   - `{{CONTEXT.docstring}}`: the `@act` docstring (verbatim — `code_task` must preserve it byte-for-byte).
   - `{{CONTEXT.action_sequence}}`: the corrected sequence from the triage subagent.
   - `{{CONTEXT.chosen_locators}}`: the corrected locators from the triage subagent.
   - `{{CONTEXT.fixtures_available}}`: run `list-fixtures.ts` if not already cached.

2. After `code_task` returns, run the single test:
   ```sh
   npx playwright test <file> -g "<test-name>"
   ```

3. **On green**: mark as **Healed**.
4. **On red**: mark as **Unhealable**. Stash for user review in Step 5.

#### `real-bug`

The app does not match the docstring's intent. The test is correct; the app is broken.

Record for the final report. No code changes.

#### `ambiguous`

The subagent could not confidently classify the failure.

Stash for user review in Step 5.

#### `unhealable`

The subagent determined this is drift but could not find a working sequence.

Stash for user review in Step 5.

### Step 5: Interactive resolution (if needed)

If any failures are classified as **ambiguous** or **unhealable** (either from the triage subagent or from a failed heal re-run), block and present them to the user:

```
These failures need your input:

1. `tests/act/checkout.spec.ts` › `pay with valid card` — Ambiguous: could not determine if the submit button is broken or the locator changed.
   - Subagent evidence: [summary]
   - What do you think? (app bug / try different approach / skip)

2. `tests/act/settings.spec.ts` › `change username` — Unhealable: rewrote the body but still fails.
   - Last error: [summary]
   - What do you think? (app bug / manual fix needed / skip)
```

For each, the user may:
- Confirm it is an **app bug** — move to the "App bugs suspected" section.
- Provide guidance for another attempt — re-triage or re-rewrite.
- **Skip** — exclude from the report. The test remains failing in the working tree.

The user may also accept a **partial report** at any time ("just give me what you have"). Respect this — produce the report with whatever is resolved so far.

### Step 6: Mandatory re-run verification

Before producing the final report, verify that every test marked "Healed" is actually green. Run each healed test one more time:

```sh
npx playwright test <file> -g "<test-name>"
```

If any healed test fails on this re-run, downgrade it to **Unhealable** and add it to the user review queue (Step 5). No test is reported as "Healed" without a passing re-run.

### Step 7: Produce the final report

Print the heal report in this exact markdown format (functional spec SS5.5):

```markdown
## ActRight heal report — <YYYY-MM-DD>

**Summary**: X tests ran — N pass, N flaky, N healed, N app bug.

### Healed (N)
- `<file>` › `<test-name>` — <one-line description of what changed>. Diff in working tree.
  ```diff
  - <old line>
  + <new line>
  ```

### App bugs suspected (N)
- `<file>` › `<test-name>` — <one-line description of the suspected bug>. Reproduced in Playwright MCP; trace at `<trace-path>`.

### Flaky (N)
- `<file>` › `<test-name>` — failed once, passed on retry.

### No action (N passing)
```

Rules for the report:
- Healed entries include inline diffs (the key changed lines, not the full diff).
- App bug entries include the trace path if available.
- Flaky entries are listed but require no action.
- "No action" is a count, not a per-test list.
- Non-act tests that failed are listed under "No action" with a note: "(not act-managed)".
- If a section has zero entries, include the heading with "(0)" and no bullet points.

After the report, ask:

```
Would you like to commit the healed changes?
```

If yes, commit the changed test files with a descriptive message. If no, the changes remain in the working tree.

## Scope of heal edits

These rules are non-negotiable (functional spec SS5.4):

- **Default scope**: heal edits only the `test()` call body of failing tests.
- **Docstring edits**: ALWAYS interactive, NEVER silent. If heal determines a docstring is stale (e.g. an outdated hint, a renamed assertion), propose the edit to the user with an explanation. Write it only after explicit approval.
- **Never modify passing tests.** Heal only acts on tests that are currently failing.
- **Never modify sibling tests.** Even if they are in the same file, only the failing test's body is touched.
- **Never touch imports/fixtures/helpers at file scope** unless strictly required (e.g. adding a missing import). If such a change is needed, flag it in the report.

## Subagent usage

| Subagent | When | Purpose |
|---|---|---|
| `explore_app` (triage) | Step 3, one per failure | Reproduce the failure and classify as drift/real-bug/ambiguous/unhealable. |
| `code_task` (rewrite_body) | Step 4, for drift verdicts | Rewrite the test body with corrected locators/sequence. |

Spawn triage subagents **in parallel** — multiple Agent calls in one message. `code_task` subagents for drift verdicts can also run in parallel if multiple drifts are identified simultaneously.

See `references/subagents.md` for spawn mechanics and manager discipline.

## Edge cases

| Situation | Behavior |
|---|---|
| Hand-edited test body between heal runs | Not a concern. Heal only acts on failing tests. A passing hand-tuned body is left alone. If the hand-tuned body is failing, heal triages and rewrites it like any other failure. |
| Concurrent authoring and heal on same file | v1: simple serialization — one skill at a time per file. |
| Playwright retry greens a flake | Reported as flaky in the report. No action taken. |
| Ambiguous or unhealable failure | Interactive block (Step 5). User resolves each before the final report. |
| User interrupts mid-heal | Partial progress preserved (already-rewritten tests remain in working tree). No rollback. Skill can resume on next invocation. |
| Failed test has no `@act` docstring | Not act-managed. Skip triage. Report under "No action" as a non-act failure. |
| Multiple `@act` docstrings separated by blank lines from their `test()` calls | Malformed. Skip — report as malformed under "No action". Do not triage. |
| `@act` docstring with empty body (`/* @act\n*/`) | Treat as "intent not yet written." Skip triage. Report under "No action" with note: "docstring has no intent — use `/act new` to fill it in." |
| Playwright test command fails to start | Surface stderr. Offer to check `webServer` config. Do not proceed. |
| Subagent budget exceeded | Subagent returns `ambiguous`. Stash for user review in Step 5. |
| Non-act test failure mixed in | Report under "No action" with "(not act-managed)". Do not triage or rewrite. |

## Reporting

The final report (Step 7) is the primary output. Format is specified above. Always end with the commit prompt.
