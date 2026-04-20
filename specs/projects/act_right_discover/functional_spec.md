---
status: complete
---

# Functional Spec: ActRight Discover (`/act discover`)

## 1. Purpose & Scope

### 1.1 Purpose

Cold-start an act-managed test suite for an existing app by scanning the codebase, identifying pages and components, and authoring UI tests for all flows/options/functions — autonomously, in parallel, with heavy use of sub-agents to keep per-agent context manageable.

### 1.2 In scope

- One new mode: `/act discover`.
- Discovery that reads source (not the running UI) to enumerate pages and components.
- Autonomous test authoring for each discovery group, reusing the docstring convention (§3 of v1 spec) and producing standard act-managed Playwright tests.
- Human-in-the-loop *only* via `open_questions.md` and the top-level manager's chat with the user (approval gates, answering questions that blocked sub-agents).
- Persistent planning docs under `.act_right/discovery/` so work can resume.
- Final results summary (tests written, pass/fail counts, suspected bugs).
- Verified end-to-end against **Kiln (SvelteKit)** — same target bar as v1.

### 1.3 Out of scope

- API-only test generation (UI testing only).
- Automatic bug fixing. Discover writes tests; it does not modify app code.
- Heal behavior. If a test ends up red, it's reported and left for `/act heal`.
- Runtime LLM in the test suite (same thesis as v1).
- New docstring conventions. Discover produces the same `@act` docstring shape as `/act new`.
- New runners, reporters, or fixture systems.

### 1.4 Alignment with v1 thesis

Per v1 §1: *AI writes and heals tests. AI never runs them deterministically.* Discover fits inside "writes" — it's `/act new` scaled to a codebase, run autonomously. The tests it produces are pure Playwright Test code indistinguishable from hand-authored act tests.

## 2. Invocation

### 2.1 Syntax

```
/act discover [scope]
```

- **No scope** — discover the entire codebase. Default behavior.
- **Scope provided** — free-form text describing a feature, folder, or subset (e.g. `/act discover auth`, `/act discover src/routes/projects`). The discovery agent respects the scope and limits its enumeration accordingly. Scope is passed verbatim into the discovery agent's `CONTEXT.scope`.

README documentation must mention both forms so users know scoping is available.

### 2.2 Prerequisites

- `/act setup` must have been run (Playwright configured, MCP registered, testDir identified).
- If `.act_right/discovery/plan.md` does not exist, a full discovery runs.
- If it exists, see §9 Resume Semantics.

## 3. Artifact Layout

All persistent state for a discover run lives under `.act_right/discovery/`. The parent `.act_right/` directory is added to `.gitignore`.

```
.act_right/
└── discovery/
    ├── plan.md              # The plan + progress (YAML frontmatter status)
    ├── open_questions.md    # Questions implementation agents could not resolve
    └── (optional) notes/    # Free-form scratch area for discovery agent; not spec'd
```

### 3.1 `plan.md` shape

```markdown
---
status: in-progress   # or: complete
scope: auth           # omitted if no scope
discovery_started: 2026-04-20T14:03:00Z
discovery_completed: 2026-04-20T14:08:00Z  # set when discovery phase finishes
---

# Discovery Plan

Brief paragraph describing what the discovery agent found at a high level (framework, how many routes/components, anything unusual).

## Groups

- [ ] Group 1: Authentication flows
  - [ ] `src/routes/login/+page.svelte` — login page
  - [ ] `src/routes/signup/+page.svelte` — signup page
  - [ ] `src/lib/components/AuthForm.svelte` — shared auth form (covered via parent pages)
  - **Notes:** Signup and login share a form component; testing both pages gives good component coverage.
  - **Test file target:** `<testDir>/act/discover/auth.spec.ts`
- [ ] Group 2: Project CRUD
  - [ ] `src/routes/projects/+page.svelte` — list
  - [ ] `src/routes/projects/new/+page.svelte` — create
  - [ ] `src/routes/projects/[id]/edit/+page.svelte` — edit
  - **Notes:** Create and edit share form layout; pair them for efficiency.
  - **Test file target:** `<testDir>/act/discover/projects.spec.ts`
- ...
```

**Rules**
- Top-level bullet `- [ ] Group N: ...` = unit of work for **one** implementation agent.
- Nested bullets = pages/components covered by that group.
- Check-off behavior: an implementation agent ticks *only* the nested bullets it completed and the top-level group box if all its nested items are done. It may not edit any other group's bullets, the preamble, or frontmatter (except `status: complete` — see §9.3).
- `**Notes:**` is written by the discovery agent to justify pairings for the implementation agent.
- `**Test file target:**` is the absolute-ish path the implementation agent should write into. Discovery agent chooses this; see §5.3 for the naming rule.

### 3.2 `open_questions.md` shape

```markdown
# Open Questions

- [ ] **Group 2 (Project CRUD):** The edit form has a "Delete project" button. Should we test the deletion flow destructively, or is there a soft-delete / undo mechanism I missed?
  - **Context:** I wrote tests for create and edit. I skipped delete because I was unsure whether it is destructive or reversible.
  - **To resume:** After the user answers, continue test authoring for the delete flow in `<testDir>/act/discover/projects.spec.ts`. The other Project CRUD tests are already written.
- [ ] ...
```

**Rules**
- Created empty (title only) by the discovery agent at start.
- Appended to by implementation agents when they hit a blocker they cannot resolve from code/UI.
- Each entry MUST include both the question and enough context for a **different** implementation agent to pick up the work later (the original agent's context is gone).
- The top-level manager reads this file after all implementation agents finish; unresolved boxes trigger the open-questions loop (§7).
- When an open question is answered and acted on, the implementation agent that addresses it ticks the box.

## 4. Flow Overview

The flow has two levels: the top-level manager (you, responding to `/act discover`) and sub-agents. Sub-agents do not spawn further sub-agents — this is a hard constraint because Claude Code does not support nested sub-agent spawning. Everything a sub-agent needs to do, it does in its own context.

```
/act discover
│
├─ Phase A: Discovery Agent  (one-shot sub-agent, fresh context)
│    reads code → writes plan.md + empty open_questions.md
│
├─ Phase B: Implementation Loop  (manager dispatches, up to N in parallel)
│    for each unchecked group:
│       └─ Implementation Agent  (sub-agent)
│             does everything for its group in one context:
│             - reads relevant pages/components from disk
│             - drafts @act docstrings
│             - uses Playwright MCP to explore the app for locators (if needed)
│             - writes test bodies
│             - runs tests via `npx playwright test`
│             - iterates on failures
│             - edits plan.md and open_questions.md via search/replace
│
├─ Phase C: Open Questions Resolution  (user chat + re-dispatch)
│    if open_questions.md has unchecked items → ask user, dispatch cleanup
│    loop until no new unchecked items added
│
└─ Phase D: Results Summary  (manager runs full test suite, reports totals)
```

The manager owns: user interaction, approvals, parallelism control, summarization, and the final test-suite run.
Sub-agents own: exploration, code emission, and test iteration — all in one flat context per agent.

### 4.1 Why implementation agents are flat, not nested

A three-level hierarchy (implementation agent spawning further explore_code / explore_app / code_task sub-agents) would be a cleaner separation of concerns but is not supported in Claude Code, which is the target coding agent (v1 §2.1). The implementation agent must do all exploration, drafting, writing, and running inside its own context.

Consequences:
- Each implementation agent uses more context than a classic single-purpose sub-agent. The agent must be disciplined about what it reads and when — broad globs first, narrow reads when drafting, avoid re-reading files.
- Debugging failures inside an implementation agent is harder for the top-level manager: it only sees the terse return summary. Any detailed reasoning lives inside the agent's context and is lost when it returns.
- For "n tests per group" work, the agent handles them sequentially within its own context rather than fanning out. This is fine because parallelism across groups (§6.2) already provides throughput.

## 5. Phase A — Discovery Agent

### 5.1 When dispatched

Runs once per discover invocation (unless the user chose "resume" on an existing complete plan — see §9). Dispatched by the top-level manager.

The manager dispatches with a short message telling the sub-agent to read and follow `references/subagent_discovery.md` — the manager does NOT read the reference content itself (architecture §7.3).

### 5.2 Responsibilities

- Determine the app framework (SvelteKit, Next.js, React Router, etc.) via file-glob + config inspection. This informs what counts as a "page" vs "component."
- If `CONTEXT.scope` is non-empty, constrain enumeration to that scope.
- Enumerate all pages and user-facing components.
- Group them into units of work for implementation agents. Rules:
  - A single page alone is a valid group.
  - Pair pages that share a form/component so one agent can cover both efficiently.
  - Pair a component with a page that uses it when the component is best tested through its parent.
  - Prefer groups of 1–4 items. A group with more than 4 items is a smell; reconsider splitting.
- After a first-pass grouping, **verify completeness** by running at least one additional file-search sweep (globs for `*.svelte` / `*.tsx` / `*.vue` etc. depending on framework) and cross-checking against the plan. No page or component should be missing from at least one group.
- Pick the test file target for each group using the rule in §5.3.
- Write `plan.md` (frontmatter `status: in-progress`, `discovery_started` set, `discovery_completed` unset until its own run ends).
- Write `open_questions.md` with just the `# Open Questions` heading.
- Return a short summary to the manager: group count, page/component count, any framework detection warnings.

### 5.3 Test file target naming

Discovery agent chooses test file paths using:

```
<testDir>/act/discover/<slug>.spec.ts
```

- `<testDir>` comes from `playwright.config.ts`.
- `<slug>` is a kebab-case derivative of the group title.
- If a file already exists at that path, the discovery agent appends `-2` (and so on). It never overwrites.
- Placing under `act/discover/` — a stable subdirectory — keeps discover output easy to find, review, and later move/delete.

### 5.4 Allowed tools

Read, Grep, Glob. No browser. No edits except the two planning files.

### 5.5 Budget

Up to **50 file reads**. The manager's prompt to the agent states this explicitly.

### 5.6 Output contract

The discovery agent returns a markdown block:

```
## Summary
<one paragraph: framework, group count, page/component count>

## Artifacts written
- .act_right/discovery/plan.md
- .act_right/discovery/open_questions.md

## Warnings
- <framework ambiguity, folders I ignored and why, anything the manager should surface to the user>
```

### 5.7 Approval gate

After the discovery agent returns, the top-level manager shows the user a brief summary (group titles + counts) and asks for approval to proceed to implementation. The user can:

- Approve → proceed to Phase B.
- Request edits → the manager can manually adjust `plan.md` (split/merge groups, drop noise). The discovery agent is not re-spawned for minor edits.
- Abort → stop.

This is the **only** human gate between Phase A and Phase B; once approved, implementation runs fully autonomous.

## 6. Phase B — Implementation Loop

### 6.1 Outer manager behavior

For each unchecked top-level group in `plan.md`:

1. Dispatch an implementation agent for that group (see §6.3).
2. Respect the parallelism cap (§6.2).
3. When an agent returns, re-read `plan.md` to confirm its check-offs landed and no stray edits occurred.
4. Accumulate each agent's short summary.
5. When all groups are processed, proceed to Phase C.

### 6.2 Parallelism

- Default concurrent cap: **3** implementation agents.
- Rationale: each implementation agent drives a browser via Playwright MCP and invokes `npx playwright test`. More than ~3 concurrent browser/test activities risks resource contention on a dev laptop.
- **Known parallelism risks** (resolve during implementation, not spec'd here in detail):
  - **webServer port conflicts.** Playwright's `webServer` config assumes one dev server on one port. Concurrent `npx playwright test` invocations are safe *if* `webServer.reuseExistingServer` is true (they share the server); Playwright's default behavior handles this. Confirm during implementation and document for users.
  - **Shared app state.** Concurrent test runs may mutate the same database / auth state. If the user's fixtures don't isolate per worker, parallel test runs will flake. Not discover's job to fix — but the manager should surface "flakes during parallel run" as a likely-shared-state warning.
  - **Playwright MCP session conflicts.** Playwright MCP typically runs one browser session per agent. Concurrent sub-agents each attaching to MCP should be fine if the MCP server supports multiple sessions; if not, drop the cap to 1.
- If any of the above cause problems in practice, drop the default cap to 1. That removes all concurrency concerns at the cost of throughput.
- Override: user can request a different cap when launching `/act discover` (e.g. `/act discover --parallel=5`), and the manager should also accept a conversational override if the user says so before approving the plan. V1 implements the flag; conversational override is a nice-to-have.
- Dispatch model: the manager launches up to N agents in a single message (parallel Agent tool calls), waits for *any* to return, then dispatches the next pending group. A simple FIFO queue is sufficient.

### 6.3 Implementation agent dispatch

The manager dispatches a sub-agent with a short message telling it to read and follow `references/subagent_implement_group.md` — the manager does NOT read or inline the reference content (architecture §7.3). The dispatch message includes a CONTEXT block with these fields:

- `GOAL` — "Author tests for Group N: <title>."
- `CONTEXT.plan_path` — `.act_right/discovery/plan.md`.
- `CONTEXT.group_marker` — exact markdown line of the top-level bullet, so the agent can locate *only* its section for editing.
- `CONTEXT.group_items` — list of page/component paths in this group.
- `CONTEXT.test_file_target` — from the plan's `**Test file target:**`.
- `CONTEXT.fixtures_json` — output of `scripts/list-fixtures.ts` (manager runs once, passes to all agents).
- `CONTEXT.base_url` — from `playwright.config.ts`.
- `CONTEXT.open_questions_path` — `.act_right/discovery/open_questions.md`.
- `CONTEXT.parallelism_note` — brief note warning that other agents may be editing other groups in parallel.

### 6.4 Implementation agent behavior

The implementation agent is a **flat worker** — it does everything for its group in its own context. Its prompt file shares behavioral guidance with `/act new` (docstring conventions, author-mode app exploration, code-emission patterns) but is a distinct reference because the mode is autonomous (no user-interaction paths) and flat (no sub-sub-agent spawning).

For its assigned group, the agent:

1. **Reads** the pages/components in its group from disk.
2. **Decides test set** — enumerates flows/options/functions per page/component. Targets "all functionality," not smoke tests. Uses its own judgment to produce a complete set (e.g. don't test obvious framework behavior).
3. **Drafts `@act` docstrings** for each test, following v1 §3 conventions.
4. **Explores app code further** using Read/Glob/Grep if it needs to understand a component's API, props, or parent relationships before drafting. Follows the budget discipline in `subagent_explore_code.md` in spirit, even though it is not running that sub-agent.
5. **Uses Playwright MCP directly** (author mode) to find the click/fill sequence and locators for each test. Follows the locator-preference order from `subagent_explore_app.md` (§1.3 of that file): `getByRole` > `getByLabel` > `getByText` > `getByTestId` > avoid CSS/XPath.
6. **Writes the test body** into the group's test file using Edit/Write. Applies the output-discipline rules from `subagent_code_task.md`: only touch the group's test file; import only what's strictly required; do not rewrite sibling tests.
7. **Runs each test** after writing it:
   ```sh
   npx playwright test <group-file> -g "<test-name>"
   ```
   - **Green** → continue.
   - **Red** → iterate: re-explore with MCP if the locator is stale, adjust the test, re-run. No fixed retry cap; the agent uses judgment about when further iteration is unlikely to help.
   - When the agent concludes the failure is not fixable by further authoring effort, it classifies:
     - **Locator/flow issue that needs human review** → leave the test red; note it as "needs heal" in its return summary.
     - **Suspected app bug** → leave the test red (the test encodes the intended behavior from the docstring). Do NOT rewrite the test to paper over the suspected bug. Flag it as a suspected bug in the return summary.
     - **Intent ambiguous / cannot determine success** → add an open question (§6.6) and move on to other tests in the group.
8. **Checks off** the nested bullets it completed in `plan.md` (see §10 for edit discipline). Checks off the top-level group bullet only if all nested items are done and no open questions were filed for this group.
9. **Returns** a terse summary (§6.7).

### 6.5 What the implementation agent does NOT do

- Ask the user anything. No user exists at its end.
- Spawn further sub-agents. It does all the work itself (§4.1).
- Edit any part of `plan.md` other than ticking its own boxes (§10.1).
- Rewrite `plan.md` or `open_questions.md` wholesale (only search/replace or append) — §10.1.
- Edit the frontmatter of `plan.md` (manager owns that — §9.4).
- Edit any other group's test file.
- Modify app code. Ever. If it thinks the app has a bug, it records it as a suspected bug and moves on.
- Auto-commit. All output lands in the working tree; commit is the user's call (same as `/act new`).

### 6.6 Filing open questions

When the agent cannot proceed on a specific test without user input, it:

1. Appends an entry to `open_questions.md` using the format in §3.2 (checkbox + question + context + to-resume instructions).
2. Continues with other tests in the group that aren't blocked.
3. Notes the open-question count in its return summary.
4. Does NOT tick the nested bullet for the blocked item — it stays unchecked so Phase C can pick it up.

### 6.7 Implementation agent return format

```
## Summary
Wrote N tests (P passing, F failing). Filed Q open questions. Flagged B suspected bugs.

## Tests written
- path/to/file.spec.ts: "<test-name>" — green
- path/to/file.spec.ts: "<test-name>" — red (suspected bug: <one line>)
- ...

## Open questions filed
- <one line each; Q total>

## Plan updates
- Ticked: <nested bullet paths / top-level group if all done>
- Wrote these directly via search/replace on plan.md.
```

### 6.8 Allowed tools

Read, Edit, Write, Glob, Grep, Bash (for `npx playwright test ...`), Playwright MCP tools (for app exploration in author mode). No Agent tool — the implementation agent must not attempt to spawn further sub-agents (Claude Code does not support it; §4.1).

### 6.9 Budget

No fixed caps on retries or explorations. The implementation agent uses judgment about when further iteration is unlikely to help and bails with a classified failure (§6.4 step 7). Users may observe long-running agents in practice — that's acceptable; throughput is prioritized over time-to-first-result.

## 7. Phase C — Open Questions Resolution

After all implementation agents return:

1. Top-level manager reads `open_questions.md`.
2. If no unchecked boxes → skip to Phase D.
3. If unchecked boxes exist, present them to the user in chat, one batch. For each:
   - Quote the question and its context.
   - Ask for the user's answer.
4. Once the user answers, dispatch **one implementation agent per affected group** to resume work. The dispatch prompt includes:
   - The specific unchecked questions for that group.
   - The user's answers.
   - The standard implementation-agent CONTEXT (same as §6.3).
5. Resumption agents follow the same behavior (§6.4), but are constrained to finish only the items gated by their assigned questions.
6. When all resumption agents return, re-read `open_questions.md`. If new unchecked boxes were added, repeat from step 3. Otherwise → Phase D.

**Infinite-loop guard:** after the third round of open-question resolution for the same group, the manager stops dispatching that group and surfaces the remaining items to the user as "unable to resolve autonomously; please handle manually."

## 8. Phase D — Results Summary

After Phase C terminates:

1. Manager runs the full discover-authored test subset:
   ```sh
   npx playwright test <testDir>/act/discover/
   ```
2. Parses the results.
3. Reports to the user:

```
Discover complete.

Plan:
- Groups: 7 total, 7 completed
- Tests written: 42
- Test file(s): <testDir>/act/discover/*.spec.ts (7 files)

Test run:
- Passing: 38
- Failing: 4

Suspected bugs (agent-flagged, left red):
- auth.spec.ts: "signup form rejects duplicate email" — signup accepted duplicate; expected 409 flow
- projects.spec.ts: "...": ...

Remaining failures (likely need /act heal):
- <file:test> — <one-line error>
- ...

Artifacts:
- Plan: .act_right/discovery/plan.md (status: complete)
- Open questions: .act_right/discovery/open_questions.md (N resolved, 0 outstanding)

Next steps:
- Commit the new tests in your working tree.
- Run /act heal to repair the remaining failures.
- Investigate suspected bugs flagged above.
```

4. Set `plan.md` frontmatter `status: complete` and `discovery_completed` timestamp.

## 9. Resume Semantics

### 9.1 Fresh vs resume detection

On `/act discover` invocation:

1. If `.act_right/discovery/` does not exist → fresh run.
2. If `.act_right/discovery/plan.md` exists, read its frontmatter `status`:
   - `in-progress` → implicitly means "discovery agent was interrupted or implementation is partial." Go to §9.2.
   - `complete` → implementation and open-question resolution were finished previously. Ask the user: "A completed discovery plan exists. Options: (a) re-run tests and regenerate summary only, (b) rename this plan to `discovery_1/` and start fresh, (c) abort." Act per answer.

If the user chose fresh start (renaming), the manager renames the existing directory to `discovery_N/` (next available integer suffix) before beginning Phase A.

### 9.2 Resume behavior for `status: in-progress`

Ask the user: "An in-progress discovery plan exists. Resume (continue from where it left off), or rename to `discovery_N/` and start over?"

On **resume**, use the `discovery_completed` frontmatter field (set by the discovery agent as the last step of its run, §5.2) to determine what phase to resume from:

- **`discovery_completed` is set** → discovery phase finished previously. Skip Phase A. Go straight to Phase B, dispatching only unchecked groups.
- **`discovery_completed` is absent** → discovery phase did not finish (agent crashed or user aborted mid-way). The partial `plan.md` cannot be trusted. Re-run Phase A from scratch, overwriting `plan.md`.

No assumption of atomic writes: `plan.md` may exist with partial groups, but the frontmatter flag is authoritative.

### 9.3 When `status: complete` is written

Set to `complete` at the end of Phase D (after the results summary is produced). Not before. If the user aborts at any earlier point, `status` stays `in-progress`.

### 9.4 Who writes frontmatter

- Discovery agent creates the frontmatter with `status: in-progress`.
- Implementation agents MUST NOT touch frontmatter. Only the top-level manager flips `status: complete`.
- `discovery_completed` timestamp is set by the discovery agent when it finishes writing the plan.

## 10. Enforcement & Trust Model

The "implementation agents only tick their own boxes" rule is prompt-based — the sub-agent prompt states it explicitly, and the prompt restricts plan edits to the agent's assigned group's section only.

This is **best-effort enforcement**, not sandboxed. The top-level manager mitigates rogue edits by reading `plan.md` before and after each implementation agent returns; if the agent edited outside its section, the manager flags it to the user and proceeds without reverting (the agent's summary already landed; a "strayed outside its section" warning in the summary is enough).

### 10.1 Concurrent edits via search/replace

Implementation agents edit `plan.md` and `open_questions.md` directly. Concurrency is handled by discipline on the edit primitive, not by funneling edits through the manager:

- **Use search/replace (Edit tool) with tight, unique `old_string` values.** Each agent's top-level bullet line and nested bullets are textually unique (they contain the group title and file paths). A search/replace that matches only its own lines will not collide with another agent's concurrent edit to a different bullet.
- **Do NOT rewrite whole files.** Never use Write to overwrite `plan.md` or `open_questions.md`. A whole-file rewrite would clobber other agents' in-flight edits.
- **`open_questions.md` edits are append-only.** Agents append new entries; they never rewrite existing ones. Appends by different agents are independent and safe.
- **Agents do not touch frontmatter.** Only the manager writes frontmatter updates (§9.4).

The manager keeps itself out of the edit critical path. Its job is orchestration and user interaction — not serializing writes.

Edits to test files do not need any discipline beyond "each group owns one file" — different files, no collision possible.

## 11. Edge Cases

| Situation | Behavior |
|---|---|
| `.gitignore` doesn't exist | Create it with `.act_right` as first line. |
| `.gitignore` exists and already ignores `.act_right` | No-op. |
| `.gitignore` exists without `.act_right` | Append `.act_right` with a leading comment: `# ActRight discover local state`. |
| `playwright.config.ts` missing | Abort with message: "Run `/act setup` first." |
| `testDir` not configured | Fall back to `tests/`. Warn the user. |
| Discovery agent returns zero groups | Surface to user: "No pages found. Is this an app? Check framework detection." Abort. |
| Discovery agent returns >25 groups | Warn the user before approval: "This plan has {N} groups. Consider scoping `/act discover <feature>` to a narrower area." |
| User edits `plan.md` while agents run | Risky but not forbidden. Agents use tight search/replace so user edits to *other* bullets are safe; edits to a bullet an agent is mid-updating may collide. Best practice: don't edit plan.md while `/act discover` is running. |
| An implementation agent crashes | Its group stays unchecked in `plan.md`. The manager can dispatch a fresh agent for the same group on the next pass (not automatic in v1 — user re-invokes `/act discover` to resume). |
| Two agents append to `open_questions.md` at the same time | File-level atomicity of Edit's append pattern handles this in practice. If a collision occurs, one Edit will fail and the agent retries. Accept the rare retry; no special coordination. |
| A test file already exists (from a prior run) | Discovery agent uses `-2` suffix (§5.3). If the user re-runs discover after completion (chose "fresh start"), the existing discover-authored files stay in the working tree; the user is responsible for cleaning them up before a fresh run. |
| Open question answered but user wants to skip it | User can check the box themselves with a note "skipped per user". Phase C loop respects checked boxes regardless of who ticked them. |
| Dev server not running | Implementation agents' `explore_app` spawns will fail. Agents will surface "dev server not reachable" in return summaries. Top-level manager asks user to start the server and retry. |
| Fixtures referenced in a draft docstring don't exist | Implementation agent files this as an open question: "Fixture X doesn't exist for Group Y. Create it, substitute an existing one, or drop the reference?" Does not create fixtures itself. |

## 12. Non-Goals / Explicit Rejections

These were considered and rejected for v1 of discover:

- **Discover writes app code.** No. Discover writes tests only.
- **Discover calls `/act heal` automatically when tests fail.** No. Discover writes; heal fixes. Conflating them hides failure modes.
- **Discover runs headless always.** Unspecified — defer to Playwright config (agents inherit whatever `playwright.config.ts` sets). No discover-specific policy.
- **Discover auto-commits the plan or the tests.** No. Same policy as `/act new`: output lands in working tree; commit is user's call.
- **Discover edits `.gitignore` silently.** No — it announces the edit in the approval gate message.
- **Discover produces a machine-readable report.** Same as v1 heal: chat report only. v1+ concern.

## 13. Open Design Questions Embedded

The following decisions are proposed with recommendations; revisiting them after implementation feedback is expected.

- **Parallelism cap of 3.** Easy to tune later. Drop to 1 if webServer / MCP / shared-state conflicts bite.
- **No fixed retry budget per test.** Agent uses judgment. Risk: runaway agents. If we see that in practice, add a soft cap.
- **Test file naming `<testDir>/act/discover/<slug>.spec.ts`.** Alternative: one file per page. Going with groups because the implementation agent owns the file and cohesion maps to its scope.
- **Direct agent writes via search/replace (no manager mutex).** Chosen for simplicity and to keep the manager's context focused on orchestration. Revisit if agents' "only edit your section" discipline proves unreliable in practice.
- **Open question count before aborting a group: 3 rounds.** Judgment call; may need tuning.

## 14. File/Code Additions Summary

New files to be added to `skill/`:

- `skill/references/discover.md` — replaces the v1 placeholder; full mode reference for the top-level manager.
- `skill/references/subagent_discovery.md` — discovery agent prompt.
- `skill/references/subagent_implement_group.md` — implementation agent prompt (flat, autonomous; §4.1).

Changes to existing files:

- `skill/SKILL.md` — add `discover` to the dispatch table.
- `skill/references/subagents.md` — add two new subagent types (`discovery`, `implement_group`) and update the parallel-spawn section to reference discover.
- `README.md` — document `/act discover [scope]` and the `.act_right/` directory.

Bundled scripts:

- No new scripts required in v1. Existing `list-fixtures.ts` is reused.
- A `list-pages.ts` helper is tempting (framework-aware page enumeration) but deferred — discovery agent can use Glob/Grep effectively, and framework-specific heuristics are better kept in prompt guidance initially.
