---
status: complete
---

# Implementation Plan: ActRight Discover

Phases are ordered by dependency. Each phase ends in a commit and is reviewable on its own. No code lands outside `skill/references/`, `skill/SKILL.md`, and `README.md` (architecture §2).

## Phases

- [x] Phase 1: Router + top-level manager — add `discover` row to `skill/SKILL.md` dispatch table; replace `skill/references/discover.md` placeholder with the full mode reference per architecture §4; update `skill/references/subagents.md` to list the two new subagent types (`discovery`, `implement_group`) and document the dispatch-by-reference pattern (architecture §7.3) alongside the existing verbatim-inlined pattern.
- [x] Phase 2: Discovery agent reference — write `skill/references/subagent_discovery.md` per architecture §5, including framework-detection guidance per §6 (SvelteKit and Next.js as worked examples, model judgment for others).
- [x] Phase 3: Implementation agent reference — write `skill/references/subagent_implement_group.md` per architecture §8, including search/replace edit primitives (§9), resume-mode handling (§10), and the instructions to load `docstring.md` / `fixtures.md` / the existing `subagent_*.md` references for behavioral guidance (§8.3). Largest and highest-risk phase; review carefully before merging.
- [x] Phase 4: Docs + Kiln verification — update `README.md` to cover `/act discover [scope]` and note `.act_right/` is git-ignored; run end-to-end verification against Kiln per architecture §13.2 (fresh run, scoped run, resume after abort, parallel run).
