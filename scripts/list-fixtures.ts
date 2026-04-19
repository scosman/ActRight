import ts from 'typescript';
import path from 'path';
import fs from 'fs';

interface FixtureInfo {
  name: string;
  file: string;
  line: number;
  type: 'async fixture' | 'value fixture' | 'unknown';
  docstring: string | null;
  dependencies: string[];
}

interface ListFixturesOutput {
  fixtures: FixtureInfo[];
  fixtureFiles: string[];
  errors?: { file: string; message: string }[];
}

/**
 * Discover fixture files in a project directory.
 * Looks for tests/fixtures.ts, tests/*fixtures*.ts, and any file in testDir matching *fixture*.ts.
 */
function discoverFixtureFiles(cwd: string, testDir: string): string[] {
  const candidates = new Set<string>();

  // Check tests/fixtures.ts
  const defaultFixtures = path.join(cwd, 'tests', 'fixtures.ts');
  if (fs.existsSync(defaultFixtures)) candidates.add(defaultFixtures);

  // Scan tests/ for *fixtures*.ts
  const testsDir = path.join(cwd, 'tests');
  if (fs.existsSync(testsDir)) {
    scanDirForFixtures(testsDir, candidates);
  }

  // Scan testDir for *fixture*.ts
  const resolvedTestDir = path.resolve(cwd, testDir);
  if (fs.existsSync(resolvedTestDir) && resolvedTestDir !== testsDir) {
    scanDirForFixtures(resolvedTestDir, candidates);
  }

  return [...candidates].sort();
}

function scanDirForFixtures(dir: string, results: Set<string>): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirForFixtures(fullPath, results);
      } else if (
        entry.isFile() &&
        /fixture/i.test(entry.name) &&
        entry.name.endsWith('.ts')
      ) {
        results.add(fullPath);
      }
    }
  } catch {
    // ignore read errors
  }
}

function parseFixturesFromFile(filePath: string): {
  fixtures: FixtureInfo[];
  error?: string;
} {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return { fixtures: [], error: `Cannot read file: ${(e as Error).message}` };
  }

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
  } catch (e) {
    return {
      fixtures: [],
      error: `Cannot parse file: ${(e as Error).message}`,
    };
  }

  const fixtures: FixtureInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isTestExtendCall(node)) {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        extractFixturesFromObject(arg, filePath, sourceFile, fixtures);
      }
    }
    ts.forEachChild(node, visit);
  }

  // Check for syntax errors
  const diagnostics = (sourceFile as { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostics && diagnostics.length > 0) {
    return {
      fixtures: [],
      error: `Syntax error: ${diagnostics[0].messageText as string}`,
    };
  }

  visit(sourceFile);
  return { fixtures };
}

function isTestExtendCall(node: ts.CallExpression): boolean {
  const expr = node.expression;
  // Match *.extend({...}) where * is any identifier — covers test.extend, base.extend, etc.
  if (
    ts.isPropertyAccessExpression(expr) &&
    expr.name.text === 'extend' &&
    ts.isIdentifier(expr.expression)
  ) {
    return true;
  }
  return false;
}

function extractFixturesFromObject(
  obj: ts.ObjectLiteralExpression,
  filePath: string,
  sourceFile: ts.SourceFile,
  fixtures: FixtureInfo[],
): void {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) && !ts.isMethodDeclaration(prop))
      continue;

    const name =
      prop.name && ts.isIdentifier(prop.name) ? prop.name.text : null;
    if (!name) continue;

    const line =
      sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile)).line +
      1;
    const fixtureType = determineFixtureType(prop);
    const dependencies = extractDependencies(prop);
    const docstring = extractPropertyDocstring(prop, sourceFile);

    fixtures.push({
      name,
      file: filePath,
      line,
      type: fixtureType,
      docstring,
      dependencies,
    });
  }
}

function determineFixtureType(
  prop: ts.PropertyAssignment | ts.MethodDeclaration,
): 'async fixture' | 'value fixture' | 'unknown' {
  if (ts.isMethodDeclaration(prop)) {
    return prop.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
      ? 'async fixture'
      : 'unknown';
  }

  const init = (prop as ts.PropertyAssignment).initializer;
  if (!init) return 'unknown';

  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
    // Check for async
    const isAsync =
      init.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ??
      false;
    // Check if it has a `use` parameter (2nd param pattern for Playwright fixtures)
    const params = init.parameters;
    if (params.length >= 2) {
      return isAsync ? 'async fixture' : 'unknown';
    }
    return 'value fixture';
  }

  // Array form: [async ({...}, use) => {...}, { scope: 'test' }]
  if (ts.isArrayLiteralExpression(init) && init.elements.length >= 1) {
    const fn = init.elements[0];
    if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
      const isAsync =
        fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ??
        false;
      return isAsync ? 'async fixture' : 'unknown';
    }
  }

  return 'value fixture';
}

function extractDependencies(
  prop: ts.PropertyAssignment | ts.MethodDeclaration,
): string[] {
  const deps: string[] = [];

  // Find the function parameter that destructures other fixtures
  let fn:
    | ts.ArrowFunction
    | ts.FunctionExpression
    | ts.MethodDeclaration
    | undefined;

  if (ts.isMethodDeclaration(prop)) {
    fn = prop;
  } else {
    const init = (prop as ts.PropertyAssignment).initializer;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      fn = init;
    } else if (ts.isArrayLiteralExpression(init) && init.elements.length >= 1) {
      const first = init.elements[0];
      if (ts.isArrowFunction(first) || ts.isFunctionExpression(first)) {
        fn = first;
      }
    }
  }

  if (!fn || fn.parameters.length === 0) return deps;

  // First param is the destructured fixtures object
  const firstParam = fn.parameters[0];
  if (firstParam.name && ts.isObjectBindingPattern(firstParam.name)) {
    for (const element of firstParam.name.elements) {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        deps.push(element.name.text);
      }
    }
  }

  return deps;
}

function extractPropertyDocstring(
  prop: ts.PropertyAssignment | ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
): string | null {
  const comments = ts.getLeadingCommentRanges(
    sourceFile.text,
    prop.getFullStart(),
  );
  if (!comments || comments.length === 0) return null;

  // Take the last comment immediately above
  const lastComment = comments[comments.length - 1];
  const text = sourceFile.text.substring(lastComment.pos, lastComment.end);

  // Clean up: strip /* */ or // delimiters
  if (text.startsWith('/*')) {
    let inner = text.slice(2, -2).trim();
    // Strip leading asterisks
    inner = inner
      .split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, '').trimEnd())
      .join('\n')
      .trim();
    return inner || null;
  }

  if (text.startsWith('//')) {
    return text.slice(2).trim() || null;
  }

  return null;
}

export async function main(
  args: string[],
): Promise<{ stdout: string; exitCode: number }> {
  let cwd = process.cwd();
  let explicitFiles: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--fixture-files') {
      explicitFiles = [];
      i++;
      while (i < args.length && !args[i].startsWith('--')) {
        explicitFiles.push(path.resolve(cwd, args[i]));
        i++;
      }
      i--; // back up since the for loop will increment
    }
  }

  const output: ListFixturesOutput = { fixtures: [], fixtureFiles: [] };

  let fixtureFiles: string[];
  if (explicitFiles) {
    fixtureFiles = explicitFiles;
  } else {
    fixtureFiles = discoverFixtureFiles(cwd, 'tests');
  }

  output.fixtureFiles = fixtureFiles;

  for (const file of fixtureFiles) {
    const result = parseFixturesFromFile(file);
    output.fixtures.push(...result.fixtures);
    if (result.error) {
      if (!output.errors) output.errors = [];
      output.errors.push({ file, message: result.error });
    }
  }

  return { stdout: JSON.stringify(output, null, 2), exitCode: 0 };
}

// Direct invocation guard
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('list-fixtures.ts') ||
    process.argv[1].endsWith('list-fixtures'));

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
