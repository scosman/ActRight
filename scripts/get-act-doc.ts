import ts from 'typescript';
import path from 'path';
import fs from 'fs';
import { findTestCalls, getTestName } from './lib/ast.js';
import { findActDocstringForTest } from './lib/docstring.js';

export async function main(
  args: string[],
): Promise<{ stdout: string; exitCode: number }> {
  if (args.length < 2) {
    return {
      stdout: JSON.stringify({
        error: 'Usage: get-act-doc.ts <file> <test-name>',
      }),
      exitCode: 1,
    };
  }

  const filePath = path.resolve(args[0]);
  const testName = args[1];

  if (!fs.existsSync(filePath)) {
    return {
      stdout: JSON.stringify({ error: 'not found' }),
      exitCode: 1,
    };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const testCalls = findTestCalls(sourceFile);

  for (const testCall of testCalls) {
    const name = getTestName(testCall);
    if (name === testName) {
      const docstring = findActDocstringForTest(sourceFile, testCall);
      if (docstring) {
        return { stdout: JSON.stringify(docstring, null, 2), exitCode: 0 };
      }
      break;
    }
  }

  return {
    stdout: JSON.stringify({ error: 'not found' }),
    exitCode: 1,
  };
}

// Direct invocation guard
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('get-act-doc.ts') ||
    process.argv[1].endsWith('get-act-doc'));

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
