import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import {
  parseActDocstring,
  findActDocstringForTest,
} from '../../skill/scripts/lib/docstring.js';
import { findTestCalls } from '../../skill/scripts/lib/ast.js';

function createSource(code: string): ts.SourceFile {
  return ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
}

function getFirstComment(source: ts.SourceFile): ts.CommentRange | undefined {
  // Scan for block comments in the full text
  const text = source.text;
  const idx = text.indexOf('/*');
  if (idx === -1) return undefined;
  const end = text.indexOf('*/', idx);
  if (end === -1) return undefined;
  return {
    pos: idx,
    end: end + 2,
    kind: ts.SyntaxKind.MultiLineCommentTrivia,
    hasTrailingNewLine: true,
  };
}

describe('parseActDocstring', () => {
  it('parses a well-formed /* @act ... */ above a test()', () => {
    const code = `/* @act
## Goals
User logs in successfully.

## Assertions
- URL is /dashboard.
*/
test('login', async ({ page }) => {});`;

    const source = createSource(code);
    const comment = getFirstComment(source)!;
    const result = parseActDocstring(comment, source);

    expect(result).not.toBeNull();
    expect(result!.sections.goals).toBe('User logs in successfully.');
    expect(result!.sections.assertions).toBe('- URL is /dashboard.');
    expect(result!.startLine).toBe(1);
    expect(result!.raw).toContain('@act');
  });

  it('returns null for /* Not @act */', () => {
    const code = `/* Not @act */
test('foo', async () => {});`;

    const source = createSource(code);
    const comment = getFirstComment(source)!;
    const result = parseActDocstring(comment, source);

    expect(result).toBeNull();
  });

  it('returns null for /** @act */ (JSDoc delimiter forbidden)', () => {
    const code = `/** @act
## Goals
Should not parse.
*/
test('foo', async () => {});`;

    const source = createSource(code);
    const comment = getFirstComment(source)!;
    // Override kind since TS would mark this as JSDoc
    const commentRange: ts.CommentRange = {
      ...comment,
      kind: ts.SyntaxKind.MultiLineCommentTrivia,
    };
    const result = parseActDocstring(commentRange, source);

    expect(result).toBeNull();
  });

  it('returns null when a blank line separates the comment from the test() call', () => {
    const code = `/* @act
## Goals
Orphaned comment.
*/

test('separated', async ({ page }) => {});`;

    const source = createSource(code);
    const testCalls = findTestCalls(source);
    expect(testCalls).toHaveLength(1);

    const result = findActDocstringForTest(source, testCalls[0]);
    expect(result).toBeNull();
  });

  it('parses each of the four named sections (Goals, Fixtures, Hints, Assertions)', () => {
    const code = `/* @act
## Goals
Log in.

## Fixtures
- seed_user

## Hints
- Button in header.

## Assertions
- URL is /home.
*/
test('full', async ({ page }) => {});`;

    const source = createSource(code);
    const comment = getFirstComment(source)!;
    const result = parseActDocstring(comment, source);

    expect(result).not.toBeNull();
    expect(result!.sections.goals).toBe('Log in.');
    expect(result!.sections.fixtures).toBe('- seed_user');
    expect(result!.sections.hints).toBe('- Button in header.');
    expect(result!.sections.assertions).toBe('- URL is /home.');
  });

  it('captures an unknown ## Notes section into sections.other.Notes', () => {
    const code = `/* @act
## Goals
Do something.

## Notes
This is a custom section.
*/
test('custom', async ({ page }) => {});`;

    const source = createSource(code);
    const comment = getFirstComment(source)!;
    const result = parseActDocstring(comment, source);

    expect(result).not.toBeNull();
    expect(result!.sections.goals).toBe('Do something.');
    expect(result!.sections.other).toBeDefined();
    expect(result!.sections.other!['Notes']).toBe('This is a custom section.');
  });

  it('handles @act on the first line with trailing whitespace', () => {
    const code = "/* @act   \n## Goals\nTest.\n*/\ntest('ws', async () => {});";

    const source = createSource(code);
    const comment = getFirstComment(source)!;
    const result = parseActDocstring(comment, source);

    expect(result).not.toBeNull();
    expect(result!.sections.goals).toBe('Test.');
  });

  it('handles a docstring that is ONLY /* @act\\n*/ (no body)', () => {
    const code = "/* @act\n*/\ntest('empty', async () => {});";

    const source = createSource(code);
    const comment = getFirstComment(source)!;
    const result = parseActDocstring(comment, source);

    expect(result).not.toBeNull();
    expect(result!.body).toBe('');
    expect(result!.sections.goals).toBeUndefined();
    expect(result!.sections.fixtures).toBeUndefined();
    expect(result!.sections.hints).toBeUndefined();
    expect(result!.sections.assertions).toBeUndefined();
  });
});

describe('findActDocstringForTest', () => {
  it('finds the @act comment immediately above a test() call', () => {
    const code = `/* @act
## Goals
Test something.
*/
test('my test', async ({ page }) => {});`;

    const source = createSource(code);
    const testCalls = findTestCalls(source);
    expect(testCalls).toHaveLength(1);

    const result = findActDocstringForTest(source, testCalls[0]);
    expect(result).not.toBeNull();
    expect(result!.sections.goals).toBe('Test something.');
  });

  it('returns null when no comment is above the test', () => {
    const code = `test('no comment', async ({ page }) => {});`;

    const source = createSource(code);
    const testCalls = findTestCalls(source);
    const result = findActDocstringForTest(source, testCalls[0]);
    expect(result).toBeNull();
  });
});
