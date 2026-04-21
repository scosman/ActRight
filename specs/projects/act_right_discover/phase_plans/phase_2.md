---
status: complete
---

# Phase 2: Discovery Agent Reference

## Overview

Write `skill/references/subagent_discovery.md` — the prompt file that the discovery sub-agent reads when dispatched by reference during Phase A of `/act discover`. This file instructs the agent to detect the app framework, enumerate pages/components, group them, and produce `plan.md` + `open_questions.md`. Per architecture section 5 and functional spec section 5.

## Steps

1. **Create `skill/references/subagent_discovery.md`** with the following structure:
   - Role preamble (you are a focused subagent, one-shot, no user interaction)
   - Purpose section (enumerate pages/components, produce discovery plan)
   - Input section (CONTEXT fields: GOAL, project_dir, scope, test_dir, plan_path, open_questions_path)
   - Procedure section (10-step procedure from architecture section 5.3):
     1. Detect framework
     2. Enumerate pages using framework-specific globs
     3. Enumerate components
     4. Apply scope filter if non-empty
     5. Group items (1-4 per group, pair shared components with pages)
     6. Verify completeness with additional glob sweep
     7. Pick test file targets (`<testDir>/act/discover/<slug>.spec.ts`)
     8. Write plan.md with frontmatter
     9. Add `discovery_completed` timestamp to frontmatter
     10. Write open_questions.md with just the heading
   - Framework detection section with SvelteKit and Next.js worked examples (architecture section 6)
   - Scope filtering logic (architecture section 6.4)
   - Plan.md format specification (functional spec section 3.1 shape)
   - Test file naming rules (functional spec section 5.3)
   - Output contract (architecture section 5.5 shape)
   - Allowed tools: Read, Glob, Grep, Write, Edit
   - Budget: 50 file reads
   - Explicit prohibitions (no browser, no Bash, no user interaction, no Agent tool)

## Tests

- NA: This phase produces only a markdown prompt/reference file. No TypeScript code is added. Verification is via prompt review and end-to-end testing in Phase 4.
