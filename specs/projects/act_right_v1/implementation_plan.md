---
status: complete
---

# Implementation Plan: ActRight v1

Phases are ordered by dependency. Each phase ends in a commit and is reviewable on its own.

## Phases

- [x] Phase 1: Repo foundation — `package.json`, `tsconfig.json`, `.gitignore`, `.eslintrc`, `.prettierrc`, `LICENSE`, minimal `README.md`, CI workflow skeleton. Node 20+ declared.
- [x] Phase 2: Helper scripts — `scripts/lib/ast.ts`, `scripts/lib/docstring.ts`, `scripts/list-fixtures.ts`, `scripts/list-act-tests.ts`, `scripts/get-act-doc.ts`. Full vitest coverage per architecture §7.1. Fixture projects under `tests/scripts/fixtures/`.
- [x] Phase 3: Skill core — `SKILL.md` router, shared references (`docstring.md`, `fixtures.md`, `subagents.md`), subagent prompt files (`subagent_explore_code.md`, `subagent_explore_app.md`, `subagent_code_task.md`).
- [x] Phase 4: Mode references — `references/new.md`, `references/setup.md`, `references/heal.md`, plus the `examples/sanity.spec.ts` fixture used by `/act setup`.
- [x] Phase 5: Docs + verification — flesh out `README.md` (install, quickstart, all three modes, troubleshooting) and `verification/kiln.md` checklist for Kiln release gate.
