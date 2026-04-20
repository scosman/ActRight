---
status: complete
---

# Phase 3: Skill Core (SKILL.md router + shared references + subagent prompts)

## Overview

This phase creates all the markdown infrastructure that the agent reads at runtime: the SKILL.md router, the shared reference files (docstring, fixtures, subagents), and the three verbatim subagent prompt files. No code changes; all deliverables are markdown.

## Steps

1. Create `SKILL.md` at repo root — YAML frontmatter per architecture SS2.1, body is the routing prose (~30 lines). Parses first token, dispatches to `references/<mode>.md`, forwards remainder as inline user request.
2. Create `references/` directory.
3. Create `references/docstring.md` — SS3 convention as agent-enforceable rules.
4. Create `references/fixtures.md` — SS6 convention.
5. Create `references/subagents.md` — SS5.9 manager/subagent pattern.
6. Create `references/subagent_explore_code.md` — verbatim subagent prompt per architecture SS3.1.
7. Create `references/subagent_explore_app.md` — verbatim subagent prompt per architecture SS3.2.
8. Create `references/subagent_code_task.md` — verbatim subagent prompt per architecture SS3.3.
9. Add `references/` and `SKILL.md` to `.prettierignore` if prettier tries to reformat agent prose.
10. Run lint, format:check, and tests to verify nothing broke.

## Tests

- NA — this phase is all markdown. No code changes, no new tests.
