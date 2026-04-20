---
status: complete
---

# Architecture: ActRight Discover (`/act discover`)

This doc turns the functional spec (sibling `functional_spec.md`) into a buildable plan. It fixes the skill file layout, the new reference prompts' structure, the top-level manager's flow as executable pseudocode, framework-detection heuristics, parallelism mechanics, search/replace edit primitives, and resume logic — deeply enough that the coding agent has no open technical decisions left.

The functional spec is the source of truth for behavior. This doc references section numbers (§4.1, §6.4, etc.) instead of restating them.

## 1. Scope & Relationship to v1 Architecture

Discover extends the v1 `/act` skill with one new mode. It **adds** files to `skill/references/` and **modifies** three existing files (`SKILL.md`, `subagents.md`, `README.md`). It does not change the `/act new`, `/act heal`, or `/act setup` flows. It does not change any bundled helper script. It does not change the docstring convention or the `@act` test identification rule.

The v1 repo shape (v1 arch §1) stands unchanged.

## 2. File Additions and Changes

### 2.1 New files

```
skill/references/
├── subagent_discovery.md         # Phase A agent prompt
└── subagent_implement_group.md   # Phase B agent prompt (flat, autonomous)
```

`skill/references/discover.md` already exists as a placeholder (9 lines, §12 of v1 arch). It is **replaced** with the full mode reference.

### 2.2 Modified files

| File | Change |
|---|---|
| `skill/SKILL.md` | Add `discover` to the dispatch table (one row). |
| `skill/references/subagents.md` | Add `discovery` and `implement_group` to the subagent type list; update the parallel-spawn section with the discover dispatch pattern. |
| `skill/references/discover.md` | Replace placeholder content with full mode reference. |
| `README.md` | Add `/act discover [scope]` to the user-facing docs; note `.act_right/` is git-ignored. |

### 2.3 No new helper scripts

Discovery uses Glob/Grep/Read for enumeration. A framework-aware `list-pages.ts` was considered and deferred (functional spec §14) — prompt-guided discovery is sufficient for v1.

### 2.4 No new runtime deps

Sub-agents use tools already available in Claude Code (Read, Glob, Grep, Edit, Write, Bash, Playwright MCP). No new npm deps added to `package.json`.

## 3. `SKILL.md` Router Change

One dispatch-table row is added. The router logic is unchanged; it already forwards everything after the first token as the inline user request — `/act discover auth` will pass `auth` through untouched as the scope.

New row:

```markdown
| `discover` | `references/discover.md` | Cold-start: enumerate pages, author tests in parallel |
```

Valid-modes error message becomes:

```
> Valid modes: `new`, `setup`, `heal`, `discover`. Usage: `/act <mode> [description]`
```

No other changes to `SKILL.md`.

## 4. `references/discover.md` — Top-Level Manager

Rewrites the placeholder. Mirrors the structure of `new.md` (the closest cousin).

### 4.1 Outline

```
# /act discover

## Purpose
  (1 paragraph; references functional spec §1)

## When to use / When NOT to use
  (mirrors new.md §1.2/§1.3)

## Before you start
  - Load `references/subagents.md` now.
  - Do NOT pre-load `subagent_discovery.md` or `subagent_implement_group.md`; they
    are dispatched verbatim to sub-agents (§6 of this doc).
  - Identify $SKILL_DIR and $PROJECT_DIR.
  - Identify `testDir` from `playwright.config.ts`.

## Flow
  Step 1: Parse scope argument.
  Step 2: Handle .act_right/discovery/ state (§10 of this doc).
  Step 3: Phase A — dispatch discovery agent (§5 of this doc).
  Step 4: Present plan to user; wait for approval.
  Step 5: Phase B — dispatch implementation agents in batches (§7 of this doc).
  Step 6: Phase C — open-question resolution loop.
  Step 7: Phase D — run full test suite, produce results summary.

## Subagent usage
  | Subagent | Phase | Purpose |
  | discovery | A | enumerate pages/components, write plan |
  | implement_group | B, C | author tests for one group, fully autonomous |

## Edge cases (§11 of functional spec)
```

### 4.2 Pseudocode for the whole flow

The manager is the orchestrator. Its behavior is deterministic enough to sketch inline:

```
scope := args.trim()  # may be empty

if exists(".act_right/discovery/plan.md"):
    fm := read_frontmatter("plan.md")
    if fm.status == "complete":
        choice := ask_user(
            "A completed discovery plan exists. Regenerate summary only? "
            "Rename and start fresh? Abort?"
        )
        handle(choice)
        if choice == "rename":
            rename .act_right/discovery to .act_right/discovery_<next-N>
            proceed to fresh run
    elif fm.status == "in-progress":
        choice := ask_user("Resume or start over?")
        if choice == "start over":
            rename existing dir; proceed to fresh run
        else:
            if fm.discovery_completed is set:
                skip to Phase B, dispatch only unchecked groups
            else:
                re-run Phase A (overwrite plan.md)
else:
    ensure ".act_right/" exists, .gitignore contains ".act_right"
    create ".act_right/discovery/" fresh

# Phase A
spawn_discovery_agent(scope)
wait for result
present plan summary to user; get approval, edits, or abort

# Phase B
unchecked_groups := parse_plan("plan.md").filter(not checked)
while unchecked_groups:
    batch := take up to N from unchecked_groups  # N = parallelism cap, default 3
    spawn in parallel: one implement_group agent per item in batch
    wait for all to return
    for each result: verify plan.md edits landed; log stray edits
    unchecked_groups := parse_plan("plan.md").filter(not checked)

# Phase C
rounds_per_group := {}
while open_questions_has_unchecked():
    qs := parse_open_questions().filter(not checked)
    present to user, collect answers
    for each affected group:
        if rounds_per_group[group] >= 3:
            surface to user as "cannot resolve autonomously"
            mark stuck; do not re-dispatch
            continue
        rounds_per_group[group] += 1
        spawn implement_group agent with qs + answers + group CONTEXT
    wait for all to return

# Phase D
run: npx playwright test <testDir>/act/discover/
parse results; produce summary (functional spec §8)
set frontmatter: status: complete
```

### 4.3 What the manager delegates vs keeps

Kept by the manager:
- All user interaction.
- Parsing `plan.md` and `open_questions.md` to determine state.
- Frontmatter writes (`status`, `discovery_completed` timestamp per §9.4 of functional spec — actually the discovery agent writes `discovery_completed`; manager writes `status: complete` at Phase D end).
- Running the final `npx playwright test ...` for Phase D.
- Verifying sub-agent results (re-reading plan.md, logging strays).

Delegated to sub-agents:
- Framework detection, page/component enumeration, grouping.
- Per-group test authoring, app exploration, test running.

## 5. `subagent_discovery.md` — Phase A Agent

### 5.1 Shape

Mirrors `subagent_explore_code.md` in form (focused reader returning structured markdown). One-shot; no loop inside. Dispatched via the reference pattern (§7.3): the main manager sends a short message pointing the sub-agent at `subagent_discovery.md` + a CONTEXT block. The manager never reads the reference file.

### 5.2 CONTEXT fields (passed in the dispatch message)

```
GOAL: "Enumerate pages and components and write a discovery plan."
project_dir: <absolute path to user's project>
scope: <user's scope argument, or "">
test_dir: <testDir from playwright.config.ts>
plan_path: ".act_right/discovery/plan.md"
open_questions_path: ".act_right/discovery/open_questions.md"
```

### 5.3 Agent procedure (embedded in the prompt)

```
1. Detect framework (§6 of this doc).
2. Enumerate candidate pages using framework-specific globs.
3. Enumerate candidate components.
4. If CONTEXT.scope != "", filter enumeration to items whose paths include scope
   (case-insensitive substring) OR whose parent feature-folder matches scope.
5. Group items:
   - Pair pages that share a form/component.
   - Pair small components with their parent page.
   - Keep groups 1–4 items; more than 4 is a smell.
6. Verify completeness: run an additional glob sweep for all *.svelte / *.tsx /
   *.vue (as applicable) and confirm every match either appears in a group or
   is intentionally excluded (e.g. layouts, error pages — note the exclusion).
7. Pick test file targets using the naming rule (<testDir>/act/discover/<slug>.spec.ts).
8. Write plan.md with frontmatter (status: in-progress, discovery_started NOW,
   discovery_completed omitted, scope optional, parallelism omitted).
9. After writing the plan body, re-open plan.md and add discovery_completed: NOW
   to frontmatter as the final step.
10. Write open_questions.md with just "# Open Questions".
11. Return the output block in the shape below.
```

### 5.4 Allowed tools

Read, Glob, Grep, Write, Edit. No Bash (the script `npx playwright show-config` is not needed — testDir is pre-resolved by the manager and passed in CONTEXT).

### 5.5 Output contract

```
## Summary
<1 paragraph: framework detected, N groups, M pages, K components>

## Artifacts written
- .act_right/discovery/plan.md
- .act_right/discovery/open_questions.md

## Warnings
- <framework ambiguity, folders I ignored and why, exclusions>
- <"None" if no warnings>
```

### 5.6 Budget

Up to **50 file reads** (matches functional spec §5.5). Glob calls are cheap and not counted; file Read calls are.

## 6. Framework Detection

The discovery agent detects the app framework and picks appropriate globs for pages and components. The prompt gives two worked examples (SvelteKit and Next.js) and trusts the model to apply the same pattern to other popular frameworks (Vue/Nuxt, Remix, Astro, Solid, etc.) from its own training knowledge. Hard-coding every framework is not worth the maintenance burden — the patterns are well-known and stable.

### 6.1 Example 1: SvelteKit

Detection signals: `svelte.config.js` present, or `@sveltejs/kit` in `package.json`.

Pages: `src/routes/**/+page.svelte`, `src/routes/**/+page.ts`.
Components: `src/lib/**/*.svelte`, `src/components/**/*.svelte`.
Exclusions: `node_modules`, `.svelte-kit`, `build`.

### 6.2 Example 2: Next.js

Detection signals: `next.config.{js,mjs,ts}` present, or `next` in `package.json`.

Pages (app router): `app/**/page.{tsx,ts,jsx,js}`, `src/app/**/page.{tsx,ts,jsx,js}`.
Pages (pages router): `pages/**/*.{tsx,ts,jsx,js}` excluding `_app.*`, `_document.*`, `api/**`.
Components: `components/**/*.{tsx,jsx}`, `src/components/**/*.{tsx,jsx}`.
Exclusions: `node_modules`, `.next`, `build`.

### 6.3 Other frameworks

The prompt instructs the discovery agent to apply the same detect-then-glob pattern for any other framework it identifies (checking `package.json` deps + characteristic config files + conventional directory names). It emits a Warning in the output naming the framework it used so the user can sanity-check at the approval gate.

### 6.4 Scope filtering

Applied after enumeration. Match logic:

```
for each candidate in enumerated_pages + enumerated_components:
    if CONTEXT.scope.lower() in candidate.relpath.lower():
        include
    elif candidate.feature_folder.lower() == CONTEXT.scope.lower():
        include
    else:
        exclude
```

`feature_folder` is the last path segment before the framework-specific page file (e.g. `auth` in `src/routes/auth/+page.svelte`).

## 7. Parallelism & Dispatch

### 7.1 Batch model (not rolling queue)

**Decision: batch-wait, not continuous FIFO.**

Rationale: Claude Code's message model returns all tool results together at the end of the assistant's turn. A rolling FIFO ("replace each agent as it returns") requires per-agent completion events, which aren't available. Batches match the model naturally and are simpler to reason about.

Procedure:

```
while unchecked_groups:
    batch := unchecked_groups[:N]  # N = cap, default 3
    unchecked_groups := unchecked_groups[N:]
    dispatch in parallel (one message, multiple Agent tool calls)
    wait for the batch to complete
    process each result
```

This has a small throughput cost — the batch waits on its slowest member — but correctness is more important than the last few percent of parallelism.

### 7.2 Parallelism cap resolution

```
cap := parse_flag("--parallel", default=3)
if user_said("run sequentially" | "drop to 1" | similar) in approval chat:
    cap := 1
```

Cap is 3 by default. If the implementation phase emits warnings about port conflicts or flaky shared-state behavior (§6.2 of functional spec), the manager suggests dropping to 1 on the next invocation.

### 7.3 Dispatch mechanics — dispatch by reference, not inlined prompt

Existing v1 subagents are spawned by the manager reading the full `subagent_*.md` file and passing its entire content verbatim as the sub-agent prompt (v1 subagents.md §How to Spawn a Subagent). That pattern bloats the manager's context with thousands of tokens per dispatch, especially when dispatching 3 implementation agents in a batch.

**Discover uses a dispatch-by-reference pattern instead:**

- `subagent_type`: `"general-purpose"`.
- `prompt`: a short, templated message telling the sub-agent to **read and follow** the reference file itself, with the filled CONTEXT block inline. Rough shape:

```
You are an ActRight discover implementation agent. Your full instructions and
output contract are in:

  <SKILL_DIR>/references/subagent_implement_group.md

Read that file now and follow it precisely.

CONTEXT
-------
GOAL: Author tests for Group 2: Project CRUD.
plan_path: .act_right/discovery/plan.md
group_marker: - [ ] Group 2: Project CRUD
group_items:
  - src/routes/projects/+page.svelte
  - src/routes/projects/new/+page.svelte
  - src/routes/projects/[id]/edit/+page.svelte
test_file_target: tests/act/discover/projects.spec.ts
base_url: http://localhost:5173
fixtures_json: <inline JSON>
open_questions_path: .act_right/discovery/open_questions.md
parallelism_note: Other agents may be editing other groups in parallel...
resume_mode: fresh
resume_context: <empty>
```

The sub-agent's first action is to read the reference file. From there the reference file is authoritative; the reference may itself instruct the sub-agent to load other references (e.g. `docstring.md`) in its own context, keeping the manager out of that loop entirely.

**Why this diverges from v1:**

- The implementation agent reference will be large (discovery agent reference is smaller but gets the same treatment for consistency).
- The manager dispatches up to 3 agents per batch and many batches per run; verbatim-inlining multiplies the cost.
- Token savings: the manager never has to read the reference file at all — it knows only the filename.
- Accuracy: the sub-agent reads the canonical text, not a manager-transcribed copy that could drift.

**Same pattern for discovery agent:** §5 also uses dispatch-by-reference. Manager sends a short message pointing to `subagent_discovery.md` + CONTEXT block.

**v1 subagents are not retrofitted.** `explore_code`, `explore_app`, `code_task` keep the verbatim pattern from v1 — they're small prompts and changing them is out of scope for discover. The two patterns coexist.

### 7.4 Result handling after a batch

```
for each result in batch_results:
    re-read plan.md
    compare against pre-dispatch snapshot
    for strays (edits outside the agent's group): log warning to user summary
    accumulate return-summary for Phase D reporting
```

## 8. `subagent_implement_group.md` — Phase B/C Agent

### 8.1 Shape

Larger than existing subagent prompts (it does more work) but same skeleton: GOAL + CONTEXT placeholders + output contract + rules + allowed tools.

### 8.2 CONTEXT fields (passed in the dispatch message; §7.3)

```
GOAL: "Author tests for Group N: <title>." (or "Resume Group N — resolve open question <id>: <answer>")
plan_path: ".act_right/discovery/plan.md"
group_marker: <verbatim top-level bullet line>
group_items: <nested bullet lines, verbatim>
test_file_target: <absolute path>
base_url: <from playwright.config.ts>
fixtures_json: <output of scripts/list-fixtures.ts>
open_questions_path: ".act_right/discovery/open_questions.md"
parallelism_note: <one line: "Other agents may be editing other groups in parallel. Use tight search/replace; do not rewrite the plan.">
resume_mode: "fresh" | "resume"
resume_context: <verbatim open-question entry + user's answer, when resume_mode=="resume">
```

### 8.3 Guidance via referenced files, not inlined

The implementation agent cannot spawn sub-sub-agents (functional spec §4.1), but it CAN read files. `subagent_implement_group.md` is therefore written as a focused prompt that **instructs the sub-agent to read** the existing shared references in its own context:

- `docstring.md` — `@act` docstring shape. Load when drafting docstrings.
- `fixtures.md` — fixture conventions. Load when wiring fixtures into tests.
- `subagent_explore_app.md` — locator preference order and app-drive discipline. Load when using Playwright MCP. (The existing subagent prompt works as a guide even though we're not spawning it as a subagent; the content is behavioral guidance.)
- `subagent_code_task.md` — edit-discipline rules. Load when writing test bodies.
- `subagent_explore_code.md` — read-budget discipline. Load when exploring page/component code.

`subagent_implement_group.md` itself is the behavioral spine — procedure, output contract, rails — plus links to those references with short rationale for each load. The sub-agent reads what it needs, when it needs it, in its own context. The main manager never reads any of it.

This approach:
- Keeps `subagent_implement_group.md` small enough to maintain.
- Reuses existing reference content rather than duplicating/condensing it.
- Keeps the main manager out of the token-heavy path entirely (§7.3).
- Cost: the sub-agent's context accumulates as it loads refs. Mitigation: the prompt instructs the sub-agent to load each reference at most once and keep its reads targeted.

### 8.4 Agent procedure (embedded in the prompt)

```
1. Parse CONTEXT. If resume_mode == "resume", go to step 9 with the open question in mind.
2. Read each file in CONTEXT.group_items (the pages/components).
3. Identify flows/options/functions per page/component.
4. Draft a test set (list of test names + intent). Target all functionality.
5. For each test in the set:
   a. Draft the @act docstring (Goals, Fixtures, Hints, Assertions).
   b. Use Playwright MCP to drive the app, find the action sequence + locators.
   c. Write the test() call into CONTEXT.test_file_target.
   d. Run: `npx playwright test <target-file> -g "<test-name>"`.
   e. If red, iterate (re-explore with MCP, adjust). Bail when further effort is
      unlikely to help.
   f. Classify any remaining red test:
      - needs-heal (locator/flow): leave red; mention in summary.
      - suspected-bug: leave red; flag in summary; DO NOT paper over.
      - intent-ambiguous: file an open question, skip this test.
6. After all tests processed, tick checkboxes in plan.md via tight search/replace
   on each nested bullet line (and the top-level group if all done).
7. If any open questions were filed, note this in the summary; do NOT tick the
   affected items.
8. Return summary per §6.7 of functional spec.
9. (Resume mode) Read CONTEXT.resume_context. Complete the blocked item using
   the user's answer. Tick the corresponding open-question box in
   open_questions.md. Continue from step 5a for just that item.
```

### 8.5 Allowed tools

```
Read, Edit, Write, Glob, Grep, Bash (for `npx playwright test` only),
Playwright MCP tools (browser automation).
```

Explicitly NOT allowed: Agent (no sub-sub-agents, §4.1 of functional spec).

### 8.6 Rails on Bash use

The prompt restricts Bash to invocations of `npx playwright test`. No shell utilities, no `rm`, no `git`. The prompt states this explicitly. Enforcement is trust-based (no sandbox).

### 8.7 Output contract

Matches functional spec §6.7 verbatim. The agent must produce:

```
## Summary
Wrote N tests (P passing, F failing). Filed Q open questions. Flagged B suspected bugs.

## Tests written
- <file>: "<test-name>" — green | red (reason)

## Open questions filed
- <one line each>

## Plan updates
- Ticked: <which nested bullets, and top-level group if all done>
- Edits applied directly via search/replace on plan.md.
```

## 9. Search/Replace Edit Primitives

Concrete patterns the implementation agent uses to tick boxes.

### 9.1 Nested bullet tick

```
old_string: "  - [ ] src/routes/login/+page.svelte — login page"
new_string: "  - [x] src/routes/login/+page.svelte — login page"
```

The whole bullet line is the unique match. Because the discovery agent wrote each bullet with its file path and inline comment, collisions across groups are structurally impossible (different paths).

### 9.2 Top-level group tick

```
old_string: "- [ ] Group 2: Project CRUD"
new_string: "- [x] Group 2: Project CRUD"
```

Group title is unique in the plan by discovery-agent construction (the discovery agent must ensure unique group titles; noted in its prompt).

### 9.3 Open question append

```
Edit tool:
  old_string: "# Open Questions\n"
  new_string: "# Open Questions\n\n- [ ] **Group 2 (Project CRUD):** ...\n  - **Context:** ...\n  - **To resume:** ...\n"
```

Appending before any existing entries keeps the file well-formed; subsequent appends match on the heading line regardless of how many entries exist. If two agents append concurrently and one Edit fails due to the file having changed between read and write, the agent re-reads and retries — this is implicit in the Edit tool's behavior and worth mentioning in the prompt ("if an append fails, re-read and retry once").

### 9.4 Open question tick (Phase C resumption)

```
old_string: "- [ ] **Group 2 (Project CRUD):** The edit form has a ..."
new_string: "- [x] **Group 2 (Project CRUD):** The edit form has a ..."
```

The agent matches on enough of the question text to be unique.

## 10. Resume Flow Implementation

### 10.1 State detection decision tree

```
state := "fresh"
if exists(".act_right/discovery/"):
    if exists(".act_right/discovery/plan.md"):
        fm := parse_frontmatter("plan.md")
        if fm.status == "complete":
            state := "prior-complete"
        elif fm.status == "in-progress":
            if fm.discovery_completed is set:
                state := "in-progress-discovery-done"
            else:
                state := "in-progress-discovery-partial"
        else:
            state := "unknown"
    else:
        state := "stale-dir"  # dir exists, no plan — user-created or leftover
```

### 10.2 Transitions

| State | Manager action |
|---|---|
| `fresh` | Create dir; ensure .gitignore; proceed Phase A |
| `prior-complete` | Ask user: regen-summary / rename-and-fresh / abort |
| `in-progress-discovery-done` | Ask user: resume / rename-and-fresh. On resume → skip A, go to B with unchecked groups |
| `in-progress-discovery-partial` | Ask user: resume / rename-and-fresh. On resume → re-run Phase A, overwriting plan.md |
| `stale-dir` | Ask user: use existing empty dir / rename / abort. Treat as fresh after user confirms |
| `unknown` | Ask user: rename-and-fresh or abort. Do not proceed without a known frontmatter |

### 10.3 Rename convention

`.act_right/discovery_1/`, `.act_right/discovery_2/`, ... (smallest unused integer suffix). The manager scans the parent directory and picks `1 + max(existing suffixes)`.

## 11. `.gitignore` & `.act_right/` Management

On first run (state = `fresh` or `stale-dir` → fresh):

```
ensure exists: .act_right/
ensure .gitignore contains line ".act_right" (exact match, on its own line)
if .gitignore does not exist: create with content ".act_right\n"
if .gitignore exists without ".act_right":
    append "\n# ActRight discover local state\n.act_right\n"
```

All handled by the top-level manager, not the discovery agent. Done before Phase A spawns.

Announcement to the user: the approval-gate message (after Phase A returns) includes one line if `.gitignore` was edited: "Added `.act_right` to `.gitignore`."

## 12. Error Handling

### 12.1 Sub-agent returns malformed output

If the discovery or implementation agent returns output that doesn't parse (missing headers, truncated, etc.):

- First instance: manager re-spawns the same agent with a prepended reminder about the output contract.
- Second instance: surface to user as a hard failure for that group; advise running `/act discover` again or scoping narrower.

### 12.2 Sub-agent exceeds its budget

- Discovery agent: returns "Insufficient evidence" (matching existing subagent pattern). Manager surfaces: "Discovery budget exceeded; consider scoping `/act discover <feature>`."
- Implementation agent: no hard budget (functional spec §6.9). If the agent runs very long, the user can interrupt; state in the plan/working tree is what it is.

### 12.3 Playwright fails to start

- `webServer` not configured and dev server not running: implementation agents will fail fast with a connection error. The agent surfaces this in its return summary; the top-level manager surfaces to the user: "Dev server not reachable. Start it and re-invoke `/act discover`."
- `webServer` configured but misconfigured (wrong port, bad command): same as above but the error comes from Playwright's webServer machinery.

### 12.4 Rogue edits to plan.md

If an implementation agent edits outside its assigned section:
- Manager detects via pre/post diff of plan.md.
- Logs a warning in the Phase D summary: "Agent for Group N edited outside its section (see plan.md diff)."
- Does NOT attempt to revert — the user can review and correct.

### 12.5 Results summary: test failures

Failures are reported in three buckets (functional spec §8):
- **Agent-flagged suspected bugs** — pulled from each agent's return summary.
- **Agent-flagged needs-heal** — pulled from each agent's return summary.
- **Other failures** — tests that failed in the final Phase D run but were marked green by the agent (regression caused by a parallel agent's fixture mutation or ordering). Listed as "unexpected failures; re-running may clear them."

## 13. Testing Strategy

### 13.1 Scope of automated tests

Discover is prompt-heavy; the runtime behavior is delegated to Claude's LLM in sub-agent contexts. There is no new TypeScript code to unit-test. The v1 approach (unit tests for bundled scripts) has nothing to apply here.

### 13.2 Verification approach

- **Prompt reviews.** The three new markdown files (`discover.md`, `subagent_discovery.md`, `subagent_implement_group.md`) are reviewed as artifacts — accuracy against the functional spec is the quality gate.
- **End-to-end against Kiln.** Invoke `/act discover` on a fresh clone of Kiln and verify:
  - Plan gets written with reasonable groups.
  - At least some groups complete autonomously (tests written, some passing).
  - `.gitignore` gets `.act_right` added.
  - Resume works after a mid-run abort.
- **End-to-end with scope.** `/act discover auth` produces a plan restricted to auth-related files.
- **End-to-end open-question flow.** Seed a plan with an ambiguous page (e.g. a destructive action) and verify the agent files an open question and resumes after the user answers.
- **Parallelism stress.** `/act discover --parallel=3` runs three agents concurrently without file-edit collisions on `plan.md`.

### 13.3 CI

No CI changes. The existing CI (v1 arch §9) runs script tests and lint; discover adds no scripts and no code. The Kiln end-to-end verification is manual (matches v1 verification approach, §11 of v1 arch).

## 14. Component Designs

This architecture is small and self-contained enough that separate component-design docs are not needed. The three new markdown files are each specified here in enough detail (§4, §5, §8) that a coding agent can draft them directly from this architecture.

**Decision: single architecture file. No `/components/` directory for this project.**

## 15. Implementation Ordering Notes

The implementation plan (next step) will phase the work. Notes for the planner:

- The three reference files are independent and can be written in any order, but the implementation agent reference is the biggest and riskiest — draft it first to expose gaps.
- `SKILL.md` and `subagents.md` changes are one-line / few-line edits; bundle them with the final phase.
- README documentation is best updated last, after the reference files are reviewed and stable.
- Kiln end-to-end verification is the final gate.

## 16. Open Technical Questions (Embedded)

The following technical decisions are proposed with recommendations; revisit if implementation reveals a problem.

- **Dispatch-by-reference for the new sub-agents (§7.3, §8.3).** Chosen: the manager sends a short dispatch message pointing to the reference file; the sub-agent reads its own prompt and links from it. Rationale: keeps the manager's context clean, saves thousands of tokens per batch, avoids transcription drift. Diverges from the v1 verbatim-inlined pattern — v1 subagents are not retrofitted.
- **Framework detection as examples + model judgment.** Two worked examples (SvelteKit, Next.js); the model applies the same pattern for other popular frameworks from training knowledge. Rationale: hard-coding every framework is maintenance burden for no real gain; the patterns are well-known and stable.
- **Batch-wait vs rolling FIFO dispatch.** Chosen: batch-wait. Rationale: matches Claude Code's message model; simpler. Cost: slowest-in-batch bottleneck.
- **Open-question append concurrency.** Chosen: best-effort with one retry on Edit failure. Rationale: collisions are rare given multi-line unique markers; full file-locking is overengineered.
- **Stale-dir state.** Chosen: treat as fresh after user confirmation. Alternative: auto-proceed without asking. User prompt adds one round-trip but avoids accidentally clobbering user files.
