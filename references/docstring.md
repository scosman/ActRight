# Docstring Convention

These rules govern the `@act` docstring that marks a Playwright test as act-managed. Enforce them when authoring, reading, or healing act tests. Source: functional spec SS3.

## Delimiter

The comment delimiter MUST be `/*` ... `*/` (a regular block comment). NEVER use `/**` (JSDoc-style).

Rationale: prettier and most formatters leave `/* */` blocks alone but will re-asterisk `/** */` blocks, destroying the markdown body.

## Tag

The first line of the comment MUST be the literal `@act`, optionally followed by trailing whitespace on that same line. The `@act` tag must appear on the opening line of the comment — not on a later line.

## Body

The body (everything between the `@act` line and the closing `*/`) is freeform markdown. No leading asterisks on body lines — this is a plain block comment, not JSDoc.

## Suggested Sections

Use the following `##` headings when they are relevant. Authors are not required to use all four.

### `## Goals`
What behavior is being verified. The authoring and heal agents treat this as prescriptive.

### `## Fixtures`
Named fixtures or preconditions. Reference by name; optionally include arguments (e.g. `seed_user(alice@example.com)`). See `references/fixtures.md` for the fixture convention (SS6).

### `## Hints`
Disposable author notes for the agent (e.g. "the gear icon is in the sidebar"). Hints help the agent locate UI elements but are not binding — the agent may discard them if they are stale.

### `## Assertions`
Explicit post-conditions. If present, the test body MUST honor them.

When authoring or healing: prefer these section headers for clarity. When reading: accept any markdown structure — the sections are suggested, not enforced on existing docstrings.

## Placement

The `@act` comment MUST be **immediately above** the `test()` call it describes. No blank lines, no other statements between the comment and the `test()` call. If there is a blank line between them, the docstring is malformed and will not be recognized.

## One Docstring Per Test

Each `test()` call gets at most one `@act` docstring. A file may contain multiple act-managed tests, each with its own docstring.

## Hand-Written Tests

Playwright tests in the same file that have no `@act` docstring are ignored by act skills. They run normally via Playwright. Do not add `@act` to tests you do not want act to manage.

## Docstring Ownership

The docstring is human-approved and agent-respected (SS3.4). Rules:

- Heal rewrites the **test body**, NOT the docstring.
- The agent NEVER writes or modifies a docstring without explicit human approval.
- If heal determines a docstring is stale (e.g. an outdated hint or assertion), it proposes the edit to the user interactively. Silent docstring edits are forbidden.

## Example Shape

From functional spec SS3.1:

```ts
/* @act
## Goals
User with valid credentials signs in from the homepage and lands on the dashboard.

## Fixtures
- seed_user(alice@example.com, correct-horse)

## Hints
- Sign-in button is in the header.

## Assertions
- URL is /dashboard.
- Dashboard heading says "Welcome, Alice".
*/
test('valid credentials', async ({ page }) => {
  // test body...
});
```

## Helper Script Invocation

To extract a single test's parsed docstring:

```sh
npx tsx --cwd "$SKILL_DIR" "$SKILL_DIR/scripts/get-act-doc.ts" <file> <test-name>
```

To list all act-managed tests in the project:

```sh
npx tsx --cwd "$SKILL_DIR" "$SKILL_DIR/scripts/list-act-tests.ts" --cwd "$PROJECT_DIR"
```

`$SKILL_DIR` is the directory where act is installed (e.g. `.claude/skills/actright`). `$PROJECT_DIR` is the user's project root. Both scripts emit structured JSON to stdout. See architecture SS4.6 for details.
