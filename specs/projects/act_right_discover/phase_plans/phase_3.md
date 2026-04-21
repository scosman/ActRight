---
status: complete
---

# Phase 3: Implementation Agent Reference

## Overview

Write `skill/references/subagent_implement_group.md` — the prompt file that implementation sub-agents read when dispatched by reference during Phase B/C of `/act discover`. This is the largest single reference in the project: it instructs the agent to author tests for a group of pages/components, run them, iterate on failures, tick plan.md checkboxes via search/replace, file open questions, and handle resume-mode. Per architecture sections 8, 9, and 10.

## Steps

1. **Create `skill/references/subagent_implement_group.md`** with the following structure:
   - Role preamble (you are a focused, flat, autonomous subagent — no user interaction, no sub-sub-agents)
   - Purpose section (author tests for one group, drive app via Playwright MCP, run tests, tick checkboxes)
   - Input section (CONTEXT fields from architecture section 8.2: GOAL, plan_path, group_marker, group_items, test_file_target, base_url, fixtures_json, open_questions_path, parallelism_note, resume_mode, resume_context)
   - Guidance references section (architecture section 8.3): instruct agent to Read these files at specific points:
     - `docstring.md` — when drafting `@act` docstrings
     - `fixtures.md` — when wiring fixtures into tests
     - `subagent_explore_app.md` — for locator preference order and app-drive discipline
     - `subagent_code_task.md` — for edit-discipline rules when writing test bodies
     - `subagent_explore_code.md` — for read-budget discipline when exploring code
   - Procedure section (9 steps from architecture section 8.4):
     1. Parse CONTEXT; if resume_mode=="resume" go to step 9
     2. Read group_items files
     3. Identify flows/options/functions
     4. Draft test set (names + intent)
     5. For each test: draft docstring, explore app with MCP, write test, run test, iterate/classify failures
     6. Tick checkboxes in plan.md via search/replace
     7. Note open questions in summary
     8. Return summary
     9. Resume mode handler
   - Search/replace edit primitives section (architecture section 9): nested bullet tick, top-level group tick, open question append, open question tick
   - Concurrency safety rules (parallelism_note discipline)
   - Output contract (architecture section 8.7 / functional spec section 6.7)
   - Allowed tools: Read, Edit, Write, Glob, Grep, Bash (npx playwright test only), Playwright MCP tools
   - Bash restriction: only `npx playwright test` invocations (architecture section 8.6)
   - Explicit prohibitions (no Agent tool, no user interaction, no modifying app code, no editing other groups, no frontmatter edits, no whole-file rewrites of plan.md or open_questions.md)

## Tests

- NA: This phase produces only a markdown prompt/reference file. No TypeScript code is added. Verification is via prompt review and end-to-end testing in Phase 4.
