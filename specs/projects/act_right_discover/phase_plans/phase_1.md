---
status: complete
---

# Phase 1: Router + Top-Level Manager

## Overview

Add `discover` to the `/act` dispatch table in `SKILL.md`, replace the placeholder `discover.md` with the full mode reference for the top-level manager, and update `subagents.md` to document the two new subagent types (`discovery`, `implement_group`) and the dispatch-by-reference pattern.

## Steps

1. **`skill/SKILL.md`** — Add `discover` row to the dispatch table:
   ```
   | `discover` | `references/discover.md` | Cold-start: enumerate pages, author tests in parallel |
   ```
   Update the description line to include `discover`. Update the valid-modes error message to include `discover`.

2. **`skill/references/discover.md`** — Replace the placeholder with the full mode reference per architecture section 4. Structure:
   - Purpose (1 paragraph)
   - When to use / When NOT to use
   - Before you start (load subagents.md, identify dirs, identify testDir)
   - Flow (Steps 1-7: parse scope, handle .act_right state, Phase A dispatch, approval gate, Phase B dispatch, Phase C open questions, Phase D results summary)
   - Subagent usage table
   - Edge cases (reference functional spec section 11)
   - Resume semantics (reference architecture section 10)
   - .gitignore management (reference architecture section 11)

3. **`skill/references/subagents.md`** — Add `discovery` and `implement_group` subagent type sections. Add a new section documenting the dispatch-by-reference pattern (architecture section 7.3) as an alternative to the existing verbatim-inlined pattern. Update the parallel spawn section to reference discover's batch dispatch.

## Tests

- NA: This phase produces only markdown prompt/reference files. No TypeScript code is added. Verification is via prompt review and end-to-end testing in Phase 4.
