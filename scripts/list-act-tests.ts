import ts from 'typescript';
import path from 'path';
import { readTestFiles, findTestCalls, getTestName } from './lib/ast.js';
import {
  findActDocstringForTest,
  parseActDocstring,
  type ActDocstring,
} from './lib/docstring.js';

interface ActTestInfo {
  file: string;
  testName: string;
  testStartLine: number;
  testEndLine: number;
  docstring: ActDocstring;
}

interface NonActTestInfo {
  file: string;
  testName: string;
  testStartLine: number;
}

interface OrphanDocstring {
  file: string;
  startLine: number;
  endLine: number;
}

interface ListActTestsOutput {
  tests: ActTestInfo[];
  nonActTests: NonActTestInfo[];
  orphanDocstrings: OrphanDocstring[];
}

/**
 * Find @act comments that are not attached to a test() call (orphans).
 * Uses the TS Compiler API to iterate over statements and their leading comment
 * ranges, avoiding false positives from string literals or template literals.
 *
 * An @act comment is orphaned if:
 * - It appears on a statement that is NOT a test() call expression statement, OR
 * - It appears on a test() call but findActDocstringForTest returns null
 *   (e.g., blank line separates the comment from the test)
 */
function findOrphanDocstrings(
  source: ts.SourceFile,
  testCalls: ts.CallExpression[],
): OrphanDocstring[] {
  // Collect positions of @act comments that ARE successfully attached to tests
  const attachedCommentPositions = new Set<number>();
  for (const testCall of testCalls) {
    const docstring = findActDocstringForTest(source, testCall);
    if (docstring) {
      const statement = findContainingStatement(source, testCall);
      const node = statement ?? testCall;
      const comments = ts.getLeadingCommentRanges(
        source.text,
        node.getFullStart(),
      );
      if (comments) {
        for (const comment of comments) {
          const parsed = parseActDocstring(comment, source);
          if (parsed) {
            attachedCommentPositions.add(comment.pos);
          }
        }
      }
    }
  }

  // Walk all statements (recursively into describe blocks) and check their
  // leading comments for unattached @act docstrings
  const orphans: OrphanDocstring[] = [];

  function visitStatements(statements: ts.NodeArray<ts.Statement>): void {
    for (const stmt of statements) {
      const comments = ts.getLeadingCommentRanges(
        source.text,
        stmt.getFullStart(),
      );
      if (comments) {
        for (const comment of comments) {
          if (attachedCommentPositions.has(comment.pos)) continue;
          const parsed = parseActDocstring(comment, source);
          if (parsed) {
            orphans.push({
              file: source.fileName,
              startLine: parsed.startLine,
              endLine: parsed.endLine,
            });
          }
        }
      }

      // Recurse into describe/block scopes
      if (ts.isBlock(stmt)) {
        visitStatements(stmt.statements);
      }
      if (
        ts.isExpressionStatement(stmt) &&
        ts.isCallExpression(stmt.expression)
      ) {
        // Recurse into test.describe(() => { ... }) bodies
        for (const arg of stmt.expression.arguments) {
          if (
            (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) &&
            arg.body &&
            ts.isBlock(arg.body)
          ) {
            visitStatements(arg.body.statements);
          }
        }
      }
    }
  }

  visitStatements(source.statements);

  // Also check trailing comments at the end of the file (comments after the last statement)
  // by checking if there are any @act comments in the file's end-of-file token
  const eofComments = ts.getLeadingCommentRanges(
    source.text,
    source.endOfFileToken.getFullStart(),
  );
  if (eofComments) {
    for (const comment of eofComments) {
      if (attachedCommentPositions.has(comment.pos)) continue;
      const parsed = parseActDocstring(comment, source);
      if (parsed) {
        orphans.push({
          file: source.fileName,
          startLine: parsed.startLine,
          endLine: parsed.endLine,
        });
      }
    }
  }

  return orphans;
}

function findContainingStatement(
  source: ts.SourceFile,
  node: ts.Node,
): ts.Statement | null {
  let current: ts.Node = node;
  while (current) {
    if (ts.isExpressionStatement(current)) {
      return current;
    }
    if (current.parent === source || !current.parent) break;
    current = current.parent;
  }
  return null;
}

export async function main(
  args: string[],
): Promise<{ stdout: string; exitCode: number }> {
  let cwd = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = path.resolve(args[i + 1]);
      i++;
    }
  }

  const output: ListActTestsOutput = {
    tests: [],
    nonActTests: [],
    orphanDocstrings: [],
  };

  const testFiles = readTestFiles(cwd);

  for (const testFile of testFiles) {
    const testCalls = findTestCalls(testFile.source);

    for (const testCall of testCalls) {
      const testName = getTestName(testCall);
      if (!testName) continue;

      const startLine =
        testFile.source.getLineAndCharacterOfPosition(
          testCall.getStart(testFile.source),
        ).line + 1;
      const endLine =
        testFile.source.getLineAndCharacterOfPosition(testCall.getEnd()).line +
        1;

      const docstring = findActDocstringForTest(testFile.source, testCall);

      if (docstring) {
        output.tests.push({
          file: testFile.path,
          testName,
          testStartLine: startLine,
          testEndLine: endLine,
          docstring,
        });
      } else {
        output.nonActTests.push({
          file: testFile.path,
          testName,
          testStartLine: startLine,
        });
      }
    }

    // Find orphan @act comments
    const orphans = findOrphanDocstrings(testFile.source, testCalls);
    output.orphanDocstrings.push(...orphans);
  }

  return { stdout: JSON.stringify(output, null, 2), exitCode: 0 };
}

// Direct invocation guard
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('list-act-tests.ts') ||
    process.argv[1].endsWith('list-act-tests'));

if (isDirectRun) {
  main(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.stdout + '\n');
      process.exit(result.exitCode);
    })
    .catch((err: Error) => {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(1);
    });
}
