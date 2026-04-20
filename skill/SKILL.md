---
name: act
description: >
  ActRight — agent skills for authoring, healing, and setting up Playwright
  tests. Trigger on /act <mode> where mode is one of: new, setup, heal, discover.
---

# /act — Router

Parse the first whitespace-delimited token of the skill argument. That token is the **mode**. Everything after the first token is the **inline user request** — forward it verbatim to the mode reference.

## Dispatch

| Mode    | Reference file        | Purpose                          |
|---------|-----------------------|----------------------------------|
| `new`   | `references/new.md`   | Author a new test interactively  |
| `setup` | `references/setup.md` | One-time project bootstrap       |
| `heal`  | `references/heal.md`  | Run, triage, repair, report      |
| `discover` | `references/discover.md` | Cold-start: enumerate pages, author tests in parallel |

If the mode token is present and matches one of the above:

1. Read the corresponding reference file.
2. Follow its instructions, passing the inline user request as context.

If the mode token is missing or does not match any of the above, respond with:

> Valid modes: `new`, `setup`, `heal`, `discover`. Usage: `/act <mode> [description]`

Then stop. Do not guess a mode.

## Important

Do NOT auto-load shared references (`docstring.md`, `fixtures.md`, `subagents.md`, or any `subagent_*.md` file) from this router. Each mode reference loads exactly the shared references it needs. Loading them here wastes context on content the mode may not use.
