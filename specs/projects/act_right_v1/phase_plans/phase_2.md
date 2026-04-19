---
status: complete
---

# Phase 2: Helper Scripts + Unit Tests

## Overview

Implement the five helper-script files that power project introspection for ActRight skills, plus comprehensive vitest unit tests. These scripts use the TypeScript Compiler API to parse Playwright projects and extract fixture definitions, @act-managed tests, and docstrings.

## Steps

1. Create `scripts/lib/ast.ts` — shared TS Compiler API helpers
   - `createProject(cwd)`: creates a `ts.Program` from tsconfig or permissive defaults
   - `readTestFiles(cwd, opts?)`: resolves testDir/testMatch from playwright.config.ts via static AST analysis, falls back to `./tests/**/*.spec.ts`, returns `TestFile[]`
   - `findTestCalls(source)`: walks AST for `test(...)` call expressions

2. Create `scripts/lib/docstring.ts` — @act docstring parser
   - `parseActDocstring(comment, source)`: parses `/* @act ... */` blocks; returns null for non-@act, JSDoc `/**`, etc.
   - `findActDocstringForTest(source, testCall)`: finds the @act comment immediately above a test() call; returns null if blank line separates them

3. Create `scripts/list-fixtures.ts` — CLI for fixture enumeration
   - Discovers fixture files, finds `test.extend({...})` calls
   - Extracts fixture name, file, line, type, docstring, dependencies
   - Exports `main(args)` for testability; top-level guard for direct invocation

4. Create `scripts/list-act-tests.ts` — CLI for @act test enumeration
   - Uses readTestFiles + findTestCalls + findActDocstringForTest
   - Outputs `{tests, nonActTests, orphanDocstrings}`
   - Exports `main(args)` pattern

5. Create `scripts/get-act-doc.ts` — CLI for single docstring extraction
   - Takes `<file> <test-name>`, outputs ActDocstring JSON or error
   - Exports `main(args)` pattern

6. Create test fixture projects under `tests/scripts/fixtures/`:
   - `basic/` — playwright.config.ts, one @act test, one hand-written test, fixtures.ts
   - `custom-testdir/` — playwright config with custom testDir
   - `orphan/` — @act comment with blank line before test
   - `malformed-fixtures/` — syntactically broken fixtures.ts
   - `empty/` — no tests at all

7. Create unit tests under `tests/scripts/`:
   - `docstring.test.ts` — 8 test cases per architecture §7.1
   - `list-act-tests.test.ts` — 5 test cases
   - `list-fixtures.test.ts` — 5 test cases
   - `get-act-doc.test.ts` — 2 test cases

## Tests

- docstring: well-formed parse, non-@act null, JSDoc null, blank-line null, four sections, unknown section, trailing whitespace, empty body
- list-act-tests: multi-file listing, nonActTests, orphans, custom testDir, empty project
- list-fixtures: single fixture, dependencies, docstring, zero extends, malformed file
- get-act-doc: found docstring, not-found error
