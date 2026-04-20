# Fixtures Convention

Fixtures are standard **Playwright Test fixtures** (`test.extend({...})`). Act does NOT invent a fixture system. Composition, lifecycle, and parameterization are all Playwright's. Source: functional spec SS6.

## Core Principle

Act adds no fixture abstraction. A fixture is a property in a `test.extend({...})` call, exactly as documented by Playwright. Act skills read fixtures; they do not define a parallel mechanism.

## How the Docstring References Fixtures

Two directions are supported (SS6.1):

1. **Named in the docstring** — under `## Fixtures`, the author lists fixture names, optionally with arguments: `- seed_user(alice@example.com)`. The authoring agent wires these into the test signature or body.
2. **Added by the agent implicitly** — when a hint implies a precondition (e.g. logged-in state), the agent may use a fixture not explicitly named in the docstring. The written test body is ground truth for what actually runs.

Neither direction is solely authoritative. The docstring says what the author wanted. The test body is what runs. Drift between them is a signal, not an error in v1.

## Composition

Fixtures compose naturally. For example, `logged_in` depends on `signed_up` — destructure `signed_up` in the `logged_in` fixture's parameter list and Playwright handles the dependency chain. No act-specific wiring is needed.

## Listing Fixtures

To list all fixtures in the project, run the helper script:

```sh
npx tsx --cwd "$SKILL_DIR" "$SKILL_DIR/scripts/list-fixtures.ts" --cwd "$PROJECT_DIR"
```

`$SKILL_DIR` is the act install directory (e.g. `.claude/skills/actright`). `$PROJECT_DIR` is the user's project root.

The script discovers fixture files by default (`tests/fixtures.ts`, `tests/*fixtures*.ts`, any file in `testDir` matching `*fixture*.ts`). Override with `--fixture-files <paths...>`.

Output is JSON to stdout (architecture SS4.3):

```json
{
  "fixtures": [
    {
      "name": "loggedIn",
      "file": "tests/fixtures.ts",
      "line": 14,
      "type": "async fixture",
      "docstring": "Creates a user and logs in. Depends on signedUp.",
      "dependencies": ["signedUp"]
    }
  ],
  "fixtureFiles": ["tests/fixtures.ts"]
}
```

If a fixture file cannot be parsed, the script returns `{ "fixtures": [], "errors": [...] }` — it does not throw.

## Authoring a Fixture

When creating a new fixture:

1. Write it as a standard Playwright Test fixture in the project's fixtures file (create the file if absent).
2. Use `test.extend({...})` — no act-specific API.
3. Write **one sanity `@act` test per fixture** that exercises the fixture and makes a simple assertion (e.g. `logged_in` fixture -> navigate to a logged-in-only page, assert it rendered).
4. Run the sanity test. On green, the fixture is confirmed working. On red, iterate.

The sanity test follows the same `@act` docstring convention as any other act test (SS3).
