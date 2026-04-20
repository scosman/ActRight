# /act discover

## Purpose

Cold-start an act-managed test suite for an existing app. Scans the codebase, identifies pages and components, groups them into units of work, and dispatches autonomous sub-agents to author UI tests for all flows/options/functions — in parallel — producing standard act-managed Playwright tests indistinguishable from hand-authored `/act new` output.

## When to use

- User wants to generate tests for an entire codebase or a broad feature area.
- User invokes `/act discover` or `/act discover <scope>`.
- No existing test suite (cold-start) or user wants to expand coverage to untested areas.

## When NOT to use

- User wants to author a single specific test — use `/act new`.
- Tests exist and are failing — use `/act heal`.
- Project has no Playwright setup — use `/act setup` first.

## Before you start

- Load `references/subagents.md` now.
- Do **NOT** pre-load `subagent_discovery.md` or `subagent_implement_group.md`. They are dispatched by reference to sub-agents (see Subagent Usage below). You never read their contents.
- Identify `$SKILL_DIR` — the act install directory.
- Identify `$PROJECT_DIR` — the user's project root.
- Identify `testDir` from `playwright.config.ts`. If `testDir` is not configured, fall back to `tests/` and warn the user.
- If `playwright.config.ts` does not exist, abort with: "Run `/act setup` first."

## Flow

### Step 1: Parse scope

The router forwards the user's text after `/act discover`. That text is the **raw args**.

1. Extract and strip the `--parallel=N` flag if present (default: 3). Store the value for use in Phase B.
2. The remainder is the **scope** — a free-form string (feature name, folder path, subset description). If empty, scope is the entire codebase.

### Step 2: Handle `.act_right/discovery/` state

Detect state using this decision tree:

| State | Condition | Action |
|---|---|---|
| `fresh` | `.act_right/discovery/` does not exist | Create dir; ensure `.act_right` in `.gitignore` (see .gitignore Management below); proceed to Phase A. |
| `prior-complete` | `plan.md` exists, frontmatter `status: complete` | Ask user: (a) re-run tests and regenerate summary only, (b) rename to `discovery_N/` and start fresh, (c) abort. |
| `in-progress-discovery-done` | `plan.md` exists, `status: in-progress`, `discovery_completed` is set | Ask user: resume or rename-and-fresh. On resume: skip Phase A, go to Phase B with only unchecked groups. |
| `in-progress-discovery-partial` | `plan.md` exists, `status: in-progress`, `discovery_completed` absent | Ask user: resume or rename-and-fresh. On resume: re-run Phase A (overwrite plan.md). |
| `stale-dir` | Dir exists but no `plan.md` | Ask user: use existing dir / rename / abort. Treat as fresh after confirmation. |
| `unknown` | `plan.md` exists but frontmatter unrecognized | Ask user: rename-and-fresh or abort. |

**Rename convention:** `.act_right/discovery_1/`, `discovery_2/`, ... (smallest unused integer suffix). Scan the parent directory and pick `1 + max(existing suffixes)`.

### Step 3: Phase A — Discovery

Dispatch one `discovery` sub-agent using the dispatch-by-reference pattern (see `subagents.md`). The dispatch message:

```
You are an ActRight discovery agent. Your full instructions and output contract
are in:

  <SKILL_DIR>/references/subagent_discovery.md

Read that file now and follow it precisely.

CONTEXT
-------
GOAL: Enumerate pages and components and write a discovery plan.
project_dir: <absolute path to $PROJECT_DIR>
scope: <scope argument, or empty string>
test_dir: <testDir from playwright.config.ts>
plan_path: .act_right/discovery/plan.md
open_questions_path: .act_right/discovery/open_questions.md
```

Wait for the agent to return. Verify it produced the expected output format (Summary, Artifacts written, Warnings). If malformed, re-spawn once with a reminder about the output contract. If malformed a second time, surface failure to user.

### Step 4: Approval gate

After the discovery agent returns:

1. Show the user a brief summary: group titles, page/component counts, framework detected, any warnings.
2. If `.gitignore` was edited, include: "Added `.act_right` to `.gitignore`."
3. If the plan has more than 25 groups, warn: "This plan has {N} groups. Consider scoping `/act discover <feature>` to a narrower area."
4. If the plan has zero groups, surface: "No pages found. Is this an app? Check framework detection." Abort.
5. Ask user: Approve / Request edits / Abort.
   - **Approve** — proceed to Phase B.
   - **Request edits** — make manual adjustments to `plan.md` per user instructions (split/merge groups, drop items). Do NOT re-spawn the discovery agent for minor edits.
   - **Abort** — stop.

This is the **only** human gate between Phase A and Phase B. Once approved, implementation runs fully autonomous.

### Step 5: Phase B — Implementation loop

Parse `plan.md` to find all unchecked top-level group bullets (`- [ ] Group N: ...`).

**Parallelism cap:** Default 3. If user specified `--parallel=N`, use that. If user said "run sequentially" during the approval chat, use 1.

**Batch dispatch:**

```
while unchecked_groups remain:
    batch := take up to N unchecked groups
    snapshot plan.md content
    dispatch in parallel: one implement_group agent per group (see dispatch below)
    wait for all in the batch to return
    for each result:
        re-read plan.md
        compare against snapshot; if edits landed outside the agent's group,
            log warning for Phase D summary
        accumulate the agent's return summary
    refresh unchecked_groups from plan.md
```

**Dispatch message for each implementation agent:**

```
You are an ActRight discover implementation agent. Your full instructions and
output contract are in:

  <SKILL_DIR>/references/subagent_implement_group.md

Read that file now and follow it precisely.

CONTEXT
-------
GOAL: Author tests for Group N: <title>.
plan_path: .act_right/discovery/plan.md
group_marker: <verbatim top-level bullet line from plan.md>
group_items:
  - <nested bullet 1 verbatim>
  - <nested bullet 2 verbatim>
  - ...
test_file_target: <from plan's **Test file target:** for this group>
base_url: <from playwright.config.ts>
fixtures_json: <output of scripts/list-fixtures.ts, run once before Phase B>
open_questions_path: .act_right/discovery/open_questions.md
parallelism_note: Other agents may be editing other groups in parallel. Use tight search/replace; do not rewrite the plan file.
resume_mode: fresh
resume_context:
```

Run `npx tsx --cwd "$SKILL_DIR" "$SKILL_DIR/scripts/list-fixtures.ts" --cwd "$PROJECT_DIR"` once before dispatching the first batch; pass its output to all agents.

### Step 6: Phase C — Open questions resolution

After all implementation agents return:

1. Read `open_questions.md`.
2. If no unchecked boxes, skip to Phase D.
3. If unchecked boxes exist, present them to the user grouped by group name. Quote the question and context for each.
4. Collect user answers.
5. Dispatch one `implement_group` agent per affected group to resume work. The dispatch message uses `resume_mode: resume` and includes `resume_context` with the verbatim open-question entry + user's answer.
6. When all resumption agents return, re-read `open_questions.md`. If new unchecked boxes were added, repeat from step 3.

**Infinite-loop guard:** After the third round of open-question resolution for the same group, stop dispatching that group. Surface remaining items to the user as "unable to resolve autonomously; please handle manually."

### Step 7: Phase D — Results summary

1. Run the full discover-authored test subset:
   ```sh
   npx playwright test <testDir>/act/discover/
   ```
2. Parse the results.
3. Report to the user:

```
Discover complete.

Plan:
- Groups: N total, M completed
- Tests written: T
- Test file(s): <testDir>/act/discover/*.spec.ts (F files)

Test run:
- Passing: P
- Failing: F

Suspected bugs (agent-flagged, left red):
- <file>: "<test-name>" — <one line>

Remaining failures (likely need /act heal):
- <file>: "<test-name>" — <one-line error>

Artifacts:
- Plan: .act_right/discovery/plan.md (status: complete)
- Open questions: .act_right/discovery/open_questions.md (N resolved, 0 outstanding)

Next steps:
- Commit the new tests in your working tree.
- Run /act heal to repair the remaining failures.
- Investigate suspected bugs flagged above.
```

4. Set `plan.md` frontmatter `status: complete` and add `discovery_completed` timestamp (if not already present). The discovery agent writes `discovery_completed` at the end of Phase A; the manager writes only `status: complete` here at the end of Phase D.

## Subagent usage

| Subagent | Prompt file | Phase | Dispatch pattern | Purpose |
|---|---|---|---|---|
| `discovery` | `references/subagent_discovery.md` | A | by-reference | Enumerate pages/components, write plan |
| `implement_group` | `references/subagent_implement_group.md` | B, C | by-reference | Author tests for one group, fully autonomous |

Both use the **dispatch-by-reference** pattern (see `subagents.md`): you send a short dispatch message pointing the sub-agent at its prompt file + a CONTEXT block. You never read the prompt file yourself.

## Edge cases

| Situation | Behavior |
|---|---|
| `.gitignore` doesn't exist | Create it with `.act_right` as first line. |
| `.gitignore` exists and already ignores `.act_right` | No-op. |
| `.gitignore` exists without `.act_right` | Append `.act_right` with a leading comment: `# ActRight discover local state`. |
| `playwright.config.ts` missing | Abort: "Run `/act setup` first." |
| `testDir` not configured | Fall back to `tests/`. Warn the user. |
| Discovery agent returns zero groups | Surface to user: "No pages found. Is this an app? Check framework detection." Abort. |
| Discovery agent returns >25 groups | Warn before approval: "This plan has {N} groups. Consider scoping `/act discover <feature>` to a narrower area." |
| Implementation agent crashes | Group stays unchecked in `plan.md`. User can re-invoke `/act discover` to resume. |
| Dev server not running | Implementation agents surface "dev server not reachable" in return summaries. Ask user to start the server and retry. |
| Fixtures referenced in a docstring don't exist | Implementation agent files this as an open question. Does not create fixtures itself. |
| Two agents append to `open_questions.md` simultaneously | If one Edit fails, the agent re-reads and retries. Accept the rare retry. |
| A test file already exists (from a prior run) | Discovery agent uses `-2` suffix on the slug. |
| User edits `plan.md` while agents run | Risky but not forbidden. Agents use tight search/replace so edits to other bullets are safe. |
| An implementation agent edits outside its section | Log warning in Phase D summary. Do NOT revert. |

## .gitignore management

On first run (state = `fresh` or treating as fresh after user confirmation):

1. Ensure `.act_right/` directory exists.
2. Ensure `.gitignore` contains the line `.act_right` (exact match, on its own line).
   - If `.gitignore` does not exist: create it with `.act_right\n`.
   - If `.gitignore` exists without `.act_right`: append `\n# ActRight discover local state\n.act_right\n`.
   - If `.gitignore` already contains `.act_right`: no-op.
3. Include the edit in the approval-gate message if performed.

## What the manager NEVER delegates

- User interaction — questions, approvals, confirmations.
- Parsing `plan.md` / `open_questions.md` to determine run state.
- Frontmatter writes to `plan.md` (`status: complete` at Phase D end).
- Running the final `npx playwright test` for Phase D.
- Verifying sub-agent results (re-reading plan.md, logging stray edits).
- Cross-agent synthesis — combining outputs for the results summary.
