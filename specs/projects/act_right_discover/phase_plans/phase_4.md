---
status: complete
---

# Phase 4: Docs + Kiln Verification

## Overview

Final phase: update README.md to document the new `/act discover` mode and note `.act_right/` gitignore convention. End-to-end Kiln verification is documented as a user-run checklist (no automated tests to write — architecture §13.1 confirms no new TypeScript code).

## Kiln Checkout Status

A Kiln checkout exists at `/Users/scosman/Dropbox/workspace/kiln_new/` but does **not** have Playwright configured (no `playwright.config.ts`). End-to-end verification requires a Kiln instance with ActRight already set up via `/act setup`.

## Steps

1. Update `README.md`:
   - Add `/act discover` row to the Skills Reference table.
   - Add a "Step E" subsection in Quickstart covering `/act discover [scope]`.
   - Note that `.act_right/` is automatically git-ignored by the discover flow.

## Tests

- NA — no new code; this phase is docs-only (architecture §13.1, §13.3).

## End-to-End Verification Checklist (User-Run)

These scenarios must be run manually against a Kiln checkout with ActRight set up:

1. **Fresh run:** `/act discover` on a clean repo (no `.act_right/` directory). Verify:
   - `.act_right/discovery/plan.md` is created with reasonable groups.
   - `.gitignore` gets `.act_right` appended.
   - At least some groups complete autonomously with tests written and some passing.

2. **Scoped run:** `/act discover auth` on the same repo. Verify:
   - Plan is restricted to auth-related pages/components.
   - Groups unrelated to auth are absent.

3. **Resume after abort:** Start `/act discover`, let Phase A complete and Phase B begin, then interrupt (Ctrl+C). Re-invoke `/act discover`. Verify:
   - Manager detects existing `.act_right/discovery/` state.
   - Prompts whether to resume or start fresh.
   - On resume, skips already-completed groups and continues from where it left off.

4. **Open-question flow:** Seed a plan with an ambiguous page (e.g. a destructive action like a "Delete Account" page) and verify:
   - The implement_group agent files an open question in the plan.
   - The manager surfaces the question to the user.
   - After the user answers, the agent resumes and completes the group.

5. **Parallelism stress:** `/act discover --parallel=3` on a repo with multiple groups in the plan. Verify:
   - Three implement_group agents run concurrently within a single session.
   - No file-edit collisions on `plan.md` between the concurrent agents.
