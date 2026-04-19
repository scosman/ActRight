---
status: complete
---

# ActRight V1

### Intro
ActRight is an AI-powered UI test workflow built on a simple thesis: **AI should write and heal tests, not run them.**

Existing AI testing tools run an agent on every test execution. That's slow, expensive, non-deterministic, and unfit for CI. ActRight splits the problem in two: AI agents author plain-English test descriptions and generate matching deterministic Playwright Test code, and separately heal those tests when the UI drifts. Running the suite is pure, fast, deterministic Playwright — no LLM in the loop.

The source of truth for each test is an English description that lives as a docstring on the Playwright `test()` call. The code body of the test is a build artifact: an agent can regenerate or repair it when the UI changes, using the docstring as intent. This makes tests cheap to run on every commit, easy to read and review, and resilient to UI changes that would break traditional selector-based tests.

ActRight is deliberately thin: it is **agent skills plus conventions on top of Playwright Test** — not a competing test framework, runner, or CLI. Playwright owns running, browsers, fixtures, config, parallelism, and file discovery. ActRight contributes a docstring convention for describing tests in English and the skills that author, heal, and discover tests inside a coding agent like Claude Code.

### Overview

- Standard Playwright Test `*.spec.ts` files are the only test artifact. No sidecar files.
- Each act-managed test carries an English description as a JSDoc above its `test()` call, tagged with `@act` to mark it as act-managed. Hand-written Playwright tests can live in the same file/folder and are ignored by act skills.
- Multiple stages, all handled by agent skills:
  - **Authoring**: an agent with browser access (via Playwright MCP) works with the user to draft the English description and generate a matching Playwright Test body.
  - **Running**: no AI. `npx playwright test`, same as any Playwright project.
  - **Healing**: fixes broken tests. 1) Playwright reports failing tests. 2) heal subagents figure out if each is a real app bug vs. UI drift. 3) for drift, rewrite the test body in place (docstring unchanged) and re-run to confirm. Review is just the diff.
  - **Discovery** (designed-for, not in v1): cold-start skill that reads the codebase and drafts an initial suite.

### What's in ActRight

ActRight is deliberately small:

- **Agent skills** (the main product). Run in your coding agent (Claude Code in v1). Use Playwright MCP to drive a real browser during authoring and heal.
- **Conventions**. Docstring format on `test()` calls, tagged `@act`, for English intent. Suggested section headers inside (Goals / Fixtures / Hints / Assertions) — guidance, not enforced.
- **Bundled helper scripts.** Small TypeScript scripts that ship with the skills and use the TS Compiler API for things like fixture listing, act-managed-test enumeration, and docstring parsing. Replaces the need for an act MCP server.
- **No new CLI.** Tests run via `npx playwright test`. No act binary.
- **No new framework package.** Tests are plain Playwright Test files; there's nothing to `import` from act.
- **No new config file.** Playwright-configurable things live in `playwright.config.ts`.

### Skills

An Agent Skill is a standard for packaging skills for agents like Claude Code.

Primary user-facing skills:
- `/act:new` — interactive skill to author a new test. Works with user via chat and Playwright MCP to draft the docstring and generate the test body until a single `.spec.ts` test is committed and green.
- `/act:heal` — mostly non-interactive. Runs Playwright, triages failures, rewrites broken test bodies in place, re-runs to confirm, and reports at the end: which were healed, which are real app bugs, and anything ambiguous the user must triage.
- `/act:setup` — one-time setup. Installs Playwright Test and Playwright MCP, scaffolds an example test, configures MCP/skills registration. Replaces a dedicated CLI installer.
- `/act:discover` — **v1+ (not v1)**. Cold-start: reads the codebase and drafts an initial suite.

Primitives (internal, composed by the skills above):
- Authoring: navigate the app via Playwright MCP, decide what to click/verify, generate a Playwright Test body from English intent.
- Playwright locator guidance: prefer role/label-based locators (`getByRole`, `getByLabel`), avoid brittle CSS/XPath.
- Heal triage: distinguish UI drift from real app bugs.
- more

### Decisions

(Full detail lives in the functional spec; summary here.)

- **Built on Playwright Test.** Not a competing framework.
- **One file per test.** English intent lives as a JSDoc `@act` block on the `test()` call. No sidecar `.md` files.
- **Freeform markdown inside the docstring**, with suggested section headers (Goals / Fixtures / Hints / Assertions). No enforced schema — the authoring/heal agents push back if intent is unclear.
- **File naming**: regular `*.spec.ts`. The `@act` tag is what distinguishes act-managed tests from hand-written ones; no new filename suffix.
- **File location**: `playwright.config.ts`'s `testDir` / `testMatch` own this. Act uses Playwright's defaults (`./tests` + `*.spec.ts`/`*.test.ts`); no act override.
- **Fixtures**: Playwright Test fixtures. ActRight does not invent a fixture system. Markdown may name fixtures for the agent to wire in.
- **Server lifecycle / baseURL / parallelism / retries / browsers / reporters / secrets**: all `playwright.config.ts`. ActRight has nothing to add here.
- **Flaky tests**: Playwright retries handle it; pass-on-retry is reported in the heal report but still exits 0.
- **Headed vs. headless for authoring/heal**: headed by default (user can watch); configurable.

### Setup (`/act:setup` skill)

Installation is a skill, not a CLI binary. The user installs act skills into their agent the same way they install any other skill, then runs `/act:setup` once to bootstrap the project.

`/act:setup` responsibilities:
- Install Playwright Test (`@playwright/test`) as a dev dep if missing.
- Install Playwright browsers (`npx playwright install chromium`) if missing.
- Install Playwright MCP project-local and register it in `.mcp.json` / `.claude/mcp.json`.
- Scaffold `playwright.config.ts` if missing, using Playwright's standard defaults. If a config already exists, leave it alone.
- Scaffold an example `*.spec.ts` with an `@act` docstring to verify the stack end-to-end.
- Print a "next steps" summary.

Parameters (asked interactively by the skill; not CLI args):
- Coding agent. `claude` for v1. Other agents (cursor, opencode, etc.) are a later add.
- CI integration. **P2, deferred.** Would add `.github/workflows/act.yml` or similar.

(No test-directory parameter — Playwright defaults are used.)

`.gitignore`: likely nothing act-specific in v1. Playwright's own ignore entries are already standard.

CI heal artifacts: ideally none — re-running locally gives the same results.

### Tech Stack

- typescript / npm
- Playwright Test (runtime — deterministic, no AI) + Playwright MCP (author/heal-time agent loop)
- a11y based: works with LLMs, not images. Fast and most common tooling for users. We could add images later but not v1. 
- No specific model or LLM framework: the AI aspect runs in your Claude Code/opencode/etc with your models.

### Misc Requirements/Notes

- Not tied to specific host server/service/technology. Runs against a running server, which could be any frontend framework/language. 

