---
status: complete
---

# Architecture: ActRight v1

This document turns the functional spec into a buildable plan. It fixes the repository shape, the skill file layout, the helper scripts' contracts, the subagent prompts' structure, and the testing strategy — deeply enough that the coding agent has no open technical decisions left.

The functional spec is the source of truth for behavior. This document does not restate it; it references section numbers (§3, §5.2, etc.) when needed.

## 1. Repository Shape

ActRight is a git repository users clone into their project (`.claude/skills/actright/` by default; §5.1). Everything the agent reads at runtime lives in the repo; nothing is built or published.

```
act_right/                        # the repo root = the skill root
├── SKILL.md                      # Claude Code skill entry; router
├── README.md                     # human-facing install + "what is this"
├── LICENSE
├── package.json                  # for helper scripts only — NOT published
├── tsconfig.json                 # for helper scripts only
├── references/
│   ├── new.md                    # /act new
│   ├── setup.md                  # /act setup
│   ├── heal.md                   # /act heal
│   ├── discover.md               # /act discover — v1+ placeholder (not shipped in v1)
│   ├── docstring.md              # shared: §3 docstring convention
│   ├── fixtures.md               # shared: §6 fixtures convention
│   ├── subagents.md              # shared: manager/subagent pattern (§5.9)
│   ├── subagent_explore_code.md  # verbatim subagent prompt
│   ├── subagent_explore_app.md   # verbatim subagent prompt
│   └── subagent_code_task.md     # verbatim subagent prompt
├── scripts/
│   ├── list-fixtures.ts          # TS Compiler API: enumerate Playwright fixtures
│   ├── list-act-tests.ts         # enumerate @act-managed tests
│   ├── get-act-doc.ts            # extract one @act docstring
│   └── lib/
│       ├── ast.ts                # shared TS Compiler API helpers
│       └── docstring.ts          # parse `/* @act ... */` blocks into sections
├── tests/
│   └── scripts/
│       ├── fixtures/             # per-test fixture project dirs (see §7.4)
│       ├── list-fixtures.test.ts
│       ├── list-act-tests.test.ts
│       ├── get-act-doc.test.ts
│       └── docstring.test.ts
├── examples/
│   └── sanity.spec.ts            # copied by /act setup as the install-verification test
└── .github/
    └── workflows/
        └── ci.yml                # runs scripts' tests + lint
```

**Notes**

- `package.json` exists solely to declare `devDependencies` (typescript, vitest, @playwright/test as a peer for types, node types) and a few `scripts` entries used by contributors. End users never run `npm install` in this repo — they clone it into their project and the agent invokes the helper scripts via `npx tsx`, which resolves `typescript` from the *user's* project (see §5.2 for the invocation contract).
- No compilation step for shipped code. Scripts are executed with `tsx` (provided by the user's project or, as a fallback, `npx tsx` which downloads on demand). We do not ship a `dist/`.
- `.gitignore` ignores `node_modules/`, `test-results/`, `.vitest/`, etc.
- We publish nothing to npm. Distribution is `git clone` (§5.1 of functional spec).

## 2. Skill Layout and Router

### 2.1 `SKILL.md`

Claude Code skills are markdown files with a frontmatter header. `SKILL.md` is the router (§5.8).

Frontmatter:

```yaml
---
name: act
description: ActRight — agent skills for authoring, healing, and setting up Playwright tests. Trigger on /act <mode> where mode ∈ {new, setup, heal}.
---
```

Body (abbreviated — full prose in the implementation):

1. Parse the first whitespace-delimited token of the skill argument. That token is the **mode**.
2. If mode is missing or unknown, list valid modes (`new`, `setup`, `heal`) and stop.
3. Dispatch to the mode's reference file:
   - `new` → `references/new.md`
   - `setup` → `references/setup.md`
   - `heal` → `references/heal.md`
4. The remainder of the argument (after the first token) is forwarded to the mode reference as the "inline user request" — e.g. `/act new log in with invalid password` passes `log in with invalid password` to `new.md`.
5. The router does not load shared references; each mode reference loads what it needs (`docstring.md`, `fixtures.md`, `subagents.md`).

The router is ~30 lines of prose. It does no other work.

### 2.2 Mode references

Each of `new.md`, `setup.md`, `heal.md` is self-contained prose that the agent follows step-by-step. They share a common template:

```markdown
# /act <mode>

## Purpose
<one paragraph>

## When to use / when NOT to use
<short>

## Before you start
- Load `references/subagents.md` now (manager/subagent pattern is core to every mode).
- Load `references/docstring.md` when touching @act docstrings.
- Load `references/fixtures.md` when touching fixtures.
- <any mode-specific preconditions>

## Flow
<numbered steps, one-to-one with functional spec §5.2 / §5.3 / §5.4>

## Subagent usage
<which subagent prompts this mode dispatches, with concrete call patterns>

## Edge cases
<table mirroring functional spec §10 entries that apply to this mode>

## Reporting
<what the manager tells the user when done>
```

The content of each mode reference is a literal transcription of the functional spec sections (§5.2–§5.5) with the manager/subagent decomposition from §5.9 woven in. There are no new behaviors; the reference files are the spec rendered as agent instructions.

### 2.3 Shared references

- **`docstring.md`** — the `/* @act ... */` convention. Word-for-word equivalent of functional spec §3, phrased as rules the agent enforces: "Use `/*` not `/**`. First line is `@act`. Body is markdown. Suggested sections: Goals / Fixtures / Hints / Assertions." Plus how to invoke `get-act-doc.ts` to parse an existing docstring. Loaded by `new.md` and `heal.md`.
- **`fixtures.md`** — §6. Explains the `test.extend({...})` pattern, how to invoke `list-fixtures.ts`, and the docstring-vs-test-body asymmetry (§6.1). Loaded by `new.md`, `setup.md`, `heal.md`.
- **`subagents.md`** — the manager/subagent pattern (§5.9). Explains *why* the manager delegates, which subagent types exist, and the rule that the manager never delegates user interaction or approvals. Points to each `subagent_*.md` prompt. Loaded by every mode.

### 2.4 Subagent prompt files

Each `subagent_*.md` is the **verbatim prompt** the manager passes to the subagent via `Agent(subagent_type="general-purpose", prompt=<file contents>)`. They are self-contained — the subagent has no conversation history, no manager context. Template:

```markdown
# Subagent: <explore_code | explore_app | code_task>

You are a focused subagent working on one concrete piece of an ActRight workflow.

## Your input
The manager will fill in these fields before handing you this prompt:
- GOAL: <what the manager wants you to produce>
- CONTEXT: <paths, docstrings, hints — only what you need>

## Allowed tools
<fixed per subagent type — see §3>

## What you must produce
<structured output contract — see §3 for each subagent type>

## How to work
<bounded, step-by-step instructions>

## What you must NOT do
- Interact with the user (there is no user at your end).
- Make irreversible changes to the project outside your scope.
- Go exploring beyond the GOAL. Stop when you have enough to answer.
- Rewrite any @act docstring (manager-only; §5.4).
```

The manager fills `GOAL` and `CONTEXT` by string substitution (simple templating: `{{GOAL}}` placeholders, replaced before calling `Agent`). Tool allowlists are fixed per subagent type (see §3) and are not variable placeholders. No subagent ever reads the manager's conversation.

## 3. Subagent Contracts

Three subagent types (§5.9). Each has a fixed input shape, a fixed output shape, and a tool allowlist. Deviations would be a spec violation.

### 3.1 `explore_code`

**Purpose**: read the user's source code to answer a focused question (e.g. "how does this app authenticate?", "where is the signup form and what are its field names?").

**Allowed tools**: Read, Grep, Glob. **No browser, no Edit.**

**Input fields** (filled by manager):
- `GOAL`: free-text question, ≤ 2 sentences.
- `CONTEXT.starting_paths`: optional list of files/dirs to anchor the search.
- `CONTEXT.fixture_hints`: optional list of fixture names the answer should tie to.

**Output contract** (subagent returns a markdown block exactly in this shape — the manager parses it):

```markdown
## Finding
<2–6 sentences, plain English, answering GOAL>

## Evidence
- `path/to/file.ts:L42-L60` — <one-line relevance note>
- `path/to/other.ts:L10` — <one-line relevance note>

## Open questions
- <anything the subagent couldn't resolve; or "None">
```

**Budget**: at most 20 file reads. If the subagent hits the ceiling without a finding, it returns `## Finding\nInsufficient evidence.` and lists what it tried under `## Open questions`.

### 3.2 `explore_app`

**Purpose**: drive the app via Playwright MCP to (a) find a concrete locator sequence matching a docstring's intent, or (b) reproduce a failing test and classify it as drift / real bug / ambiguous.

**Allowed tools**: Playwright MCP's full toolkit. **No Read/Grep/Edit/Glob** — this subagent cannot read source. If it needs code context, the manager includes it in `CONTEXT`.

**Rationale for the no-source-read rule**: prevents the subagent from wandering into the codebase mid-browser-session. The manager pre-digests any needed source via `explore_code` and hands excerpts in `CONTEXT`.

**Input fields**:
- `GOAL`: one of two shapes:
  - `author`: "Find the click/fill sequence that matches: <docstring>."
  - `triage`: "Reproduce this failing test and classify: <docstring> + <test body> + <playwright error>."
- `CONTEXT.base_url`: passed through from `playwright.config.ts`.
- `CONTEXT.fixture_state_hints`: e.g. "Assume a logged-in user; credentials are in the existing `logged_in` fixture — the app should already show the dashboard when you open `/`."
- `CONTEXT.hints`: any `## Hints` section from the docstring.
- `CONTEXT.source_excerpts`: optional — chunks of source the manager believes are relevant.

**Output contract**:

```markdown
## Mode
<author | triage>

## Verdict         # only for triage mode
<drift | real-bug | ambiguous | unhealable>

## Action sequence # only for author mode OR drift verdict
1. navigate to /
2. click role=button[name=Sign in]
3. fill label=Email with alice@example.com
...

## Chosen locators
- Sign in button: `page.getByRole('button', { name: 'Sign in' })`
- Email field:    `page.getByLabel('Email')`
...

## Evidence
- DOM snapshot excerpt (truncated, ≤ 500 tokens)
- Screenshot path if taken
- Playwright MCP traces/logs if any

## Notes for manager
<anything the manager should know; e.g. "the docstring says 'Sign in button' but the label is 'Log in' — worth confirming with user">
```

**Budget**: at most 30 Playwright MCP actions per run. Hitting the ceiling → verdict=`ambiguous` with a note.

### 3.3 `code_task`

**Purpose**: write or rewrite exactly one Playwright `test()` call body from a known action sequence and docstring.

**Allowed tools**: Read, Edit. **No Playwright MCP, no Grep/Glob**, no wandering in the project.

**Input fields**:
- `GOAL`: one of:
  - `write_new`: write a new `test()` + docstring in a target file.
  - `rewrite_body`: replace the body of an existing `test()` (found by file path + test name), leaving the docstring untouched.
- `CONTEXT.target_file`: absolute path.
- `CONTEXT.test_name`: the `test('name', …)` name.
- `CONTEXT.docstring`: the `@act` block (verbatim, with delimiters).
- `CONTEXT.action_sequence`: from `explore_app`.
- `CONTEXT.chosen_locators`: from `explore_app`.
- `CONTEXT.fixtures_available`: the `list-fixtures.ts` JSON output.

**Output contract**:

```markdown
## Edits applied
- Wrote/edited <file>:
  ```diff
  <unified diff of the change>
  ```

## Self-check
- [x] Test name matches CONTEXT.test_name
- [x] Docstring preserved byte-for-byte (for rewrite_body)
- [x] Body uses only chosen_locators (no re-derived selectors)
- [x] Only this test's body changed — no imports touched except strictly required
- [x] No sibling tests altered
```

The manager runs the test after `code_task` returns. `code_task` does not run Playwright itself — that's a manager-level action.

### 3.4 Subagent invocation contract

The manager always uses the `Agent(subagent_type="general-purpose", prompt=<templated file contents>)` pattern (Claude Code's built-in subagent spawn). Three fixed templates live in `references/subagent_*.md`. The manager fills `{{GOAL}}` and `{{CONTEXT.*}}` via simple string replace. Tool allowlists are fixed per subagent type (hardcoded in each prompt file) and are not variable placeholders. No tool calls parameters vary beyond the prompt contents — all three subagent types share the same spawn mechanic.

Subagents run in parallel when tasks are independent (functional spec §5.9: "one per test in multi-test `/act new`, one per failure in `/act heal`"). The manager emits multiple `Agent` calls in a single message to achieve this.

## 4. Helper Scripts

Three scripts ship in `scripts/`. Each is a CLI runnable via `npx tsx scripts/<name>.ts <args>`. Each prints structured JSON to stdout. Exit codes: 0 on success, 1 on any error (error object on stderr).

### 4.1 `scripts/lib/ast.ts` — shared TS Compiler API helpers

Exports:

```ts
export interface TestFile { path: string; source: ts.SourceFile; }

export function getTestName(testCall: ts.CallExpression): string | null;
// Extracts the test name (first string argument) from a test() call expression.

export function readTestFiles(cwd: string, opts?: { include?: string[] }): TestFile[];
// Resolves Playwright's testDir/testMatch from playwright.config.ts via a tiny JS-level require (not a full Playwright import).
// Falls back to `./tests/**/*.spec.ts` if no config found.

export function findTestCalls(source: ts.SourceFile): ts.CallExpression[];
// Returns every `test(...)` call (including `test.only`, `test.skip`, `test.describe` children).
```

No code generation, no writing — pure reads.

### 4.2 `scripts/lib/docstring.ts`

```ts
export interface ActDocstring {
  raw: string;              // the full comment text including delimiters
  body: string;             // the markdown body (after @act, before */)
  sections: {               // named sections
    goals?: string;
    fixtures?: string;
    hints?: string;
    assertions?: string;
    other?: Record<string, string>;  // any ## Heading we don't recognize
  };
  startLine: number;        // 1-based, in the source file
  endLine: number;
}

export function parseActDocstring(comment: ts.CommentRange, source: ts.SourceFile): ActDocstring | null;
// Returns null if this comment is not an @act docstring.
// Recognizes: `/* @act\n...\n*/` (leading @act on first or same line).
// Strips any leading-asterisk-and-space (`* `) uniformly only if EVERY non-empty line starts with `* ` — otherwise the body is passed through raw. (Covers both preferred `/* ... */` form and defensive handling if prettier breaks someone's comment.)
// Section parsing: scan for lines matching `^##\s+(Goals|Fixtures|Hints|Assertions)\b` (case-insensitive); content up to the next `^##` is the section.

export function findActDocstringForTest(
  source: ts.SourceFile,
  testCall: ts.CallExpression,
): ActDocstring | null;
// Walks the comment leading-trivia immediately above `testCall`.
// Per §3.2: the @act comment must be the immediately preceding leading comment with no blank-line separation and no other statements between. Enforce: if there is a blank line between the comment and the test call, return null (malformed; §10 "multiple @act docstrings separated by blank lines").
```

### 4.3 `scripts/list-fixtures.ts`

**Usage**: `npx tsx scripts/list-fixtures.ts [--cwd <path>] [--fixture-files <paths...>]`

**Discovery**: by default scans `tests/fixtures.ts`, `tests/*fixtures*.ts`, and any file in `testDir` whose name matches `*fixture*.ts`. `--fixture-files` overrides with an explicit list.

**What it looks for**: `test.extend({ ... })` calls. The argument object's properties are the fixtures.

**Output** (JSON to stdout):

```json
{
  "fixtures": [
    {
      "name": "loggedIn",
      "file": "tests/fixtures.ts",
      "line": 14,
      "type": "async fixture",                // best-effort: "async fixture" | "value fixture" | "unknown"
      "docstring": "Creates a user and logs in. Depends on signedUp.",
      "dependencies": ["signedUp"]            // other fixture names referenced in the destructured signature
    }
  ],
  "fixtureFiles": ["tests/fixtures.ts"]
}
```

**Error behavior**: if a fixture file can't be parsed, emit `{ "fixtures": [], "errors": [{ "file": "...", "message": "..." }] }` — do not throw.

### 4.4 `scripts/list-act-tests.ts`

**Usage**: `npx tsx scripts/list-act-tests.ts [--cwd <path>]`

**Discovery**: `readTestFiles(cwd)` from `ast.ts`. For each file, find `test(...)` calls and attach their `@act` docstring via `findActDocstringForTest`.

**Output**:

```json
{
  "tests": [
    {
      "file": "tests/act/login.spec.ts",
      "testName": "valid credentials",
      "testStartLine": 19,
      "testEndLine": 32,
      "docstring": { ... ActDocstring JSON ... }
    }
  ],
  "nonActTests": [  // Playwright tests in scanned files that have no @act docstring
    { "file": "tests/act/login.spec.ts", "testName": "hand-written sanity", "testStartLine": 50 }
  ],
  "orphanDocstrings": [  // @act comments with no test() directly below (malformed; §10)
    { "file": "tests/act/stale.spec.ts", "startLine": 4, "endLine": 10 }
  ]
}
```

### 4.5 `scripts/get-act-doc.ts`

**Usage**: `npx tsx scripts/get-act-doc.ts <file> <test-name>`

Emits the single test's `ActDocstring` JSON (same shape as inside `list-act-tests.ts`), or `{ "error": "not found" }` with exit code 1.

### 4.6 Invocation from skills

Skills never require the user to install anything new. They run scripts via:

```sh
npx tsx --cwd "$SKILL_DIR" "$SKILL_DIR/scripts/list-act-tests.ts" --cwd "$PROJECT_DIR"
```

`$SKILL_DIR` is `.claude/skills/actright` (or wherever the user cloned). `$PROJECT_DIR` is the working directory. `tsx` is provided transiently by `npx`; it does not require a local install.

If `npx` is unavailable (rare — comes with Node), the skill surfaces a clear error directing the user to install Node.

## 5. Data Flow

### 5.1 `/act setup` (functional spec §5.2)

```
user invokes /act setup
  │
  ▼
setup.md checks preconditions (package.json, playwright install, .mcp.json)
  │
  ▼
[if no Playwright] manager runs `npm init playwright@latest ...` with detected args
  │   - --quiet
  │   - --lang=ts (or js if the project has no tsconfig)
  │   - --browser=chromium
  │   - --gha (only if .github/workflows exists)
  ▼
manager registers Playwright MCP in .mcp.json
  │
  ▼
manager copies examples/sanity.spec.ts → <testDir>/act_sanity.spec.ts, runs it
  │
  ▼
manager prompts for webServer/baseURL, writes into playwright.config.ts
  │
  ▼
manager scaffolds an "app loads" sanity test, runs via Playwright (starts webServer)
  │
  ▼
[interactive] manager offers to scaffold named fixtures:
  for each fixture name:
    explore_code subagent → how does this app produce this state?
    manager drafts Playwright fixture + sanity @act test
    manager runs sanity test; on red, /act new loop per §5.3
  │
  ▼
manager prints "next steps"
```

### 5.2 `/act new` (functional spec §5.3)

```
user invokes /act new [seed description]
  │
  ▼
manager reads fixtures (list-fixtures.ts) to know what's available
  │
  ▼
manager + user converge on a draft @act docstring (interactive)
  │
  ├── [multi-test mode] manager asks "interactive or autonomous?",
  │   then plans the set of tests; loops per-test.
  │
  ▼
manager spawns explore_app(author) subagent with docstring + hints
  │
  ▼
manager spawns code_task(write_new) with sequence + locators + fixtures_available
  │
  ▼
manager runs `npx playwright test <file> -g <name>`
  │
  ├── green → report success
  ├── red → manager diagnoses:
  │         intent-vs-reality mismatch → ask user to clarify docstring
  │         locator wrong              → re-spawn explore_app with narrower goal
  │         fixture missing            → ask user (§10)
  ▼
on green, manager tells user the file is written; does NOT auto-commit.
```

### 5.3 `/act heal` (functional spec §5.4)

```
user invokes /act heal
  │
  ▼
manager runs `npx playwright test --reporter=json` (captures structured results)
  │
  ▼
manager partitions: passed, passed-on-retry (flaky), failed
  │
  ▼
[parallel, one per failure] manager spawns explore_app(triage) subagent
  │   input: docstring, current test body, playwright error excerpt, trace path
  │   output: verdict ∈ {drift, real-bug, ambiguous, unhealable}
  │
  ▼
manager collects verdicts:
  drift        → spawn code_task(rewrite_body) → run single test; on green, mark Healed; on red, mark Unhealable
  real-bug     → record for report
  ambiguous    → stash, prompt user later (interactive gate, §5.4 step 4)
  unhealable   → same
  │
  ▼
[interactive block] if any ambiguous or unhealable: prompt user, let them resolve each
  │
  ▼
manager prints the heal report (§5.5 markdown structure)
  │
  ▼
manager asks: "commit the healed changes?"
```

## 6. Error Handling Strategy

**Principle**: surface errors to the user with enough context to act, never auto-recover silently. Skills are running in a chat UI — errors ARE the UI.

**Categories**

| Source | Handling |
|---|---|
| Helper script failures (bad tsconfig, malformed test file) | Script writes JSON with `errors` array and exit 1. Manager surfaces to user with the offending file path. |
| Playwright MCP unreachable | Detected by subagent tool failure. Subagent returns `## Verdict\nambiguous` with a note. Manager escalates to user: "Playwright MCP isn't responding — check `.mcp.json`." |
| `playwright test` fails to start (dev server down, port in use) | Manager captures stderr, surfaces directly, offers to check `webServer` config. No retries. |
| `npm init playwright@latest` fails | Manager surfaces the full stderr and stops. User re-runs after fixing. |
| `@act` docstring orphaned (no `test()` below) | `list-act-tests.ts` reports under `orphanDocstrings`. Manager in `/act heal` ignores; in `/act new`, if user targeting that file, surfaces the orphan. |
| Multiple `@act` docstrings separated by blank line from `test()` | Same as orphaned — reported, ignored by heal, surfaced by new. |
| Subagent budget exceeded | Subagent returns `ambiguous` / insufficient. Manager re-spawns with narrower goal or escalates to user. No automatic retry with higher budget. |
| Fixture named in docstring doesn't exist | Manager asks user (create / substitute / drop) — §10. Does NOT auto-create. |
| Subagent returns output not matching contract | Manager re-spawns once with a "please follow the output contract" nudge. If still bad, escalates to user. |

**Never-recover list** (these stop the flow and ask the user):
- Ambiguity in test intent.
- Any docstring edit (always interactive).
- Any destructive file action outside the immediate test body.
- Any change to an existing `playwright.config.ts`.

**Logging**: skills do not write logs to disk in v1. All output is chat. Helper scripts write to stdout (JSON) and stderr (free-form errors) only.

## 7. Testing Strategy

Two separate testing concerns: (a) the helper scripts and parsing logic, and (b) the skills themselves.

### 7.1 Helper scripts — vitest unit tests

- Framework: **vitest** (fast, TS-native, ESM-friendly, matches Playwright's style).
- Location: `tests/scripts/*.test.ts`.
- Execution: `npm test` in the repo; also in CI.
- Coverage target: **every branch in `docstring.ts` and `list-act-tests.ts`** (small files; aim for 100% on these). `list-fixtures.ts` has more variance in the input shape, so focus on the listed cases below and accept lower coverage.
- Each test reads a fixture TypeScript project from `tests/scripts/fixtures/<case>/` and runs the relevant function against it. Fixture dirs are real miniature projects (a few `.spec.ts` files + maybe a `fixtures.ts`); they are not mocked.

**Test cases to implement** (exhaustive list; coding agent must implement each):

`docstring.test.ts`
- Parses a well-formed `/* @act ... */` above a `test()`.
- Returns null for `/* Not @act */`.
- Returns null for `/** @act */` (JSDoc delimiter; §3.2 forbids — we must not accept).
- Returns null when a blank line separates the comment from the `test()` call (§10 malformed).
- Parses each of the four named sections (Goals, Fixtures, Hints, Assertions).
- Captures an unknown `## Notes` section into `sections.other.Notes`.
- Handles `@act` on the first line with trailing whitespace.
- Handles a docstring that is ONLY `/* @act\n*/` (no body) — returns an ActDocstring with empty sections.

`list-act-tests.test.ts`
- Lists all act-managed tests in a multi-file fixture project.
- Ignores hand-written tests (no `@act`) but lists them under `nonActTests`.
- Reports orphan `@act` comments under `orphanDocstrings`.
- Honors a custom `testDir` set in `playwright.config.ts`.
- Returns empty arrays when no tests exist.

`list-fixtures.test.ts`
- Finds a single `test.extend({ loggedIn: async ({...}, use) => {...} })` call.
- Reports `dependencies: ["signedUp"]` when the fixture's signature destructures another fixture.
- Reports `docstring` when a JSDoc comment precedes the fixture property.
- Handles a fixtures file with zero `test.extend` calls — returns empty list.
- Handles a malformed fixtures file — returns `errors`, does not throw.

`get-act-doc.test.ts`
- Returns the parsed docstring for a given file + test name.
- Returns `{"error":"not found"}` with exit 1 when the test name is absent.

### 7.2 Skills — no automated tests in v1

Skills are markdown prose executed by an LLM. There is no practical unit test. The v1 quality gate is the **Kiln verification** (§9 of functional spec):
- `/act setup` runs to completion against Kiln.
- One real Kiln test is authored via `/act new` and committed.
- `/act heal` heals a simulated Kiln UI drift.

These are manual, recorded as a checklist in `verification/kiln.md` (a markdown artifact committed to the repo as release evidence, not an automated CI step).

### 7.3 Lint / format

- ESLint (typescript-eslint recommended preset) on `scripts/` and `tests/scripts/`.
- Prettier for formatting.
- CI runs `npm run lint` and `npm test`.
- Markdown files (`references/`, `SKILL.md`) are NOT linted — they're agent prose, not code.

### 7.4 Fixture projects

Test fixtures live in `tests/scripts/fixtures/<case-name>/` and look like miniature real projects:

```
tests/scripts/fixtures/basic/
├── playwright.config.ts
├── tests/
│   ├── fixtures.ts
│   ├── login.spec.ts       # has an @act test
│   └── hand-written.spec.ts # no @act
```

This matches how the scripts will run in the wild (against a user's project). No mocking of the file system.

## 8. Dependencies and Versions

All dev-only (nothing at runtime beyond `tsx`, which `npx` fetches on demand):

| Dep | Why | Version strategy |
|---|---|---|
| typescript | TS Compiler API for the scripts | latest stable at repo init; pin minor (`^5`) |
| tsx | run TS scripts without a build | latest (`^4`) |
| vitest | test the scripts | latest (`^1` or `^2`) |
| @playwright/test | type imports only (for fixture introspection types); peer-ish | latest |
| @types/node | node types | latest |
| eslint + @typescript-eslint/* | lint | latest recommended |
| prettier | format | latest |

Node version: require Node 20+ (current LTS family). Document in README.

No runtime LLM SDKs — skills run inside the host agent (Claude Code), which brings its own model.

## 9. Security & Privacy

- Skills run arbitrary code suggestions; the usual Claude Code permission model applies. We don't bypass it.
- Helper scripts read project files but write nothing — safe by construction.
- `/act setup` writes to `.mcp.json`, `playwright.config.ts`, and scaffolds test files. Every write is shown to the user before applying (manager responsibility in `setup.md`).
- No telemetry, no network calls from skills or scripts (other than the ones Playwright itself makes).

## 10. Component Designs (step 5 decision)

This architecture doc stays under ~300 content lines and covers the project end-to-end. Per the skill's rule (step_architecture.md), no separate component designs are needed. The mode reference files and subagent prompt files ARE the per-component designs — they live in `references/` as part of the deliverable, not in `/specs/projects/.../components/`.

## 11. Out of Scope (restated for the coding agent)

The coding agent must NOT:
- Publish to npm.
- Build a `dist/` directory.
- Add an `act` binary or CLI entry point in `package.json`.
- Add runtime LLM SDKs or model configuration.
- Add any test runner except vitest for the scripts.
- Invent a new config file; all user-facing config stays in `playwright.config.ts`.
- Implement `/act discover` (v1+ only).
- Support non-Claude agents (`/act setup` refuses politely — §10 of functional spec).
