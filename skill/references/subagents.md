# Manager / Subagent Pattern

This file describes the manager/subagent architecture that every act mode uses. Load this file at the start of any mode execution. Source: functional spec SS5.9, discover architecture SS7.

## Why Subagents

Exploring an app through Playwright MCP — DOM snapshots, accessibility trees, trial-and-error navigation — easily consumes tens of thousands of tokens per test. If every `/act new` authoring run or `/act heal` triage happened in a single context, the manager would run out of room long before the work was done. Delegating token-heavy exploration to fresh subagents keeps the manager's context focused on plan state, user interaction, and approval gates.

## You Are the Manager

When executing a mode reference (`new.md`, `heal.md`, `setup.md`), you are the **manager**. You plan, track state, talk to the user, and delegate token-heavy work to subagents. You do NOT do heavy exploration or code-writing inline.

## Subagent Types

Five subagent types exist. Each has a dedicated prompt file under `references/`. The full prompt — including input/output contracts, tool allowlists, and behavioral rules — lives in that file.

The first three (`explore_code`, `explore_app`, `code_task`) are dispatched using the **verbatim-inlined** pattern (see "How to Spawn a Subagent" below). The last two (`discovery`, `implement_group`) are dispatched using the **dispatch-by-reference** pattern (see "Dispatch by Reference" below).

### `explore_code`
**Prompt**: `references/subagent_explore_code.md`

Reads the user's source code to answer a focused question. No browser, no edits. Use when you need to understand how a feature works (auth routes, signup form fields, API endpoints) before driving the app or writing a test.

### `explore_app`
**Prompt**: `references/subagent_explore_app.md`

Drives the app via Playwright MCP. Two modes: (a) **author** — find the click/fill sequence matching a docstring's intent, or (b) **triage** — reproduce a failing test and classify it as drift / real bug / ambiguous. Cannot read source code; if it needs code context, you (the manager) include excerpts in `CONTEXT`.

### `code_task`
**Prompt**: `references/subagent_code_task.md`

Writes or rewrites exactly one `test()` call body from a docstring + action sequence. No browser, no codebase exploration. You supply everything it needs. It outputs the edit and a self-check.

### `discovery`
**Prompt**: `references/subagent_discovery.md`
**Dispatch**: by-reference (see below)

Enumerates pages and components in the user's codebase to produce a discovery plan. Detects the app framework, groups items into units of work, and writes `plan.md` + `open_questions.md`. No browser, no test writing. Used by `/act discover` Phase A.

### `implement_group`
**Prompt**: `references/subagent_implement_group.md`
**Dispatch**: by-reference (see below)

Flat, autonomous worker that authors all tests for a single group from the discovery plan. Reads source code, explores the app via Playwright MCP, writes tests, runs them, iterates on failures, and ticks checkboxes in `plan.md`. Cannot spawn further sub-agents. Used by `/act discover` Phases B and C.

## How to Spawn a Subagent

Use the Agent tool with `subagent_type="general-purpose"`. The prompt is the **verbatim contents** of the corresponding `references/subagent_<type>.md` file, with these placeholders filled by string-replace before passing:

- `{{GOAL}}` — what you want the subagent to produce.
- `{{CONTEXT.*}}` — each `CONTEXT` field relevant to that subagent type (e.g. `{{CONTEXT.starting_paths}}`, `{{CONTEXT.base_url}}`). Replace each placeholder with the concrete value.

Tool allowlists are fixed per subagent type (hardcoded in each prompt file's "Allowed tools" section) and are not variable placeholders.

Read the subagent prompt file, perform the string replacements, and pass the result as the `prompt` argument to the Agent tool.

## Dispatch by Reference

For large or frequently-dispatched sub-agents (`discovery`, `implement_group`), use the **dispatch-by-reference** pattern instead of inlining the full prompt. This keeps the manager's context lean — especially important when dispatching multiple agents in a batch.

**How it works:**

1. Do NOT read the sub-agent's prompt file yourself.
2. Send a short dispatch message via the Agent tool (`subagent_type: "general-purpose"`) that tells the sub-agent to read its own prompt file and follow it.
3. Include the filled CONTEXT block inline in the dispatch message.

**Template:**

```
You are an ActRight <role> agent. Your full instructions and output contract
are in:

  <SKILL_DIR>/references/subagent_<type>.md

Read that file now and follow it precisely.

CONTEXT
-------
GOAL: <what you want>
<field>: <value>
...
```

The sub-agent's first action is to read the reference file. From there the reference is authoritative — it may instruct the sub-agent to load additional references (e.g. `docstring.md`, `fixtures.md`) in its own context.

**Why this pattern exists alongside verbatim-inlining:**

- The `implement_group` reference is large and dispatched up to 3 times per batch, many batches per run. Inlining would bloat the manager's context by thousands of tokens per dispatch.
- The sub-agent reads the canonical text, avoiding transcription drift.
- v1 subagents (`explore_code`, `explore_app`, `code_task`) keep the verbatim pattern — they are small prompts and changing them is out of scope. The two patterns coexist.

## Parallel Spawn

Spawn subagents in parallel when tasks are independent:

- **`/act new` with multiple tests**: one `explore_app` + `code_task` chain per test.
- **`/act heal` with multiple failures**: one `explore_app` (triage) per failure.
- **`/act discover` implementation**: up to N `implement_group` agents per batch (default N=3). Dispatch all agents in a single message; wait for the batch to complete; then dispatch the next batch. This batch-wait model is specific to `/act discover` — it matches Claude Code's message model and ensures plan.md edits don't collide beyond the parallel cap. The v1 modes above (`new`, `heal`) use per-task chains instead: each subagent chain runs independently to completion.

Emit multiple Agent tool calls in a single message to achieve parallelism.

## What the Manager NEVER Delegates

- **User interaction** — clarifying questions, approvals, confirmations.
- **Docstring edits** — a subagent may propose a docstring change; only the manager presents it to the user and writes it after approval (SS3.4, SS5.4).
- **Approval gates** — deciding whether to proceed, abort, or escalate.
- **Cross-subagent synthesis** — decisions that require combining outputs from multiple subagents.

## Manager Discipline

- **Pass only what's needed.** Give each subagent the relevant docstring, the specific question, the file paths — never the full manager context or conversation history.
- **Summarize results.** After a subagent returns, summarize its findings back to the user before moving on. Do not silently chain results.
- **Re-prompt narrowly.** When a subagent returns ambiguous or incomplete findings, re-spawn with a narrower question rather than accepting vague output.
