import ts from 'typescript';
import path from 'path';
import fs from 'fs';

export interface TestFile {
  path: string;
  source: ts.SourceFile;
}

/**
 * Extract the test name (first argument) from a test() call expression.
 * Returns null if the first argument is not a string literal.
 */
export function getTestName(testCall: ts.CallExpression): string | null {
  if (testCall.arguments.length === 0) return null;
  const firstArg = testCall.arguments[0];
  if (ts.isStringLiteral(firstArg)) return firstArg.text;
  if (ts.isNoSubstitutionTemplateLiteral(firstArg)) return firstArg.text;
  return null;
}

/**
 * Statically analyze playwright.config.ts to extract testDir and testMatch values.
 * Uses the TS Compiler API to find defineConfig({...}) or module.exports = {...}
 * and reads the testDir/testMatch properties from the object literal.
 */
function parsePlaywrightConfig(cwd: string): {
  testDir?: string;
  testMatch?: string | string[];
} {
  const configPath = path.join(cwd, 'playwright.config.ts');
  if (!fs.existsSync(configPath)) return {};

  const content = fs.readFileSync(configPath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    configPath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  let configObject: ts.ObjectLiteralExpression | undefined;

  function findConfigObject(node: ts.Node): void {
    // Look for defineConfig({...})
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineConfig' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      configObject = node.arguments[0] as ts.ObjectLiteralExpression;
      return;
    }

    // Look for export default {...}
    if (
      ts.isExportAssignment(node) &&
      ts.isObjectLiteralExpression(node.expression)
    ) {
      configObject = node.expression;
      return;
    }

    ts.forEachChild(node, findConfigObject);
  }

  findConfigObject(sourceFile);
  if (!configObject) return {};

  const result: { testDir?: string; testMatch?: string | string[] } = {};

  for (const prop of configObject.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

    if (prop.name.text === 'testDir' && ts.isStringLiteral(prop.initializer)) {
      result.testDir = prop.initializer.text;
    }

    if (prop.name.text === 'testMatch') {
      if (ts.isStringLiteral(prop.initializer)) {
        result.testMatch = prop.initializer.text;
      } else if (ts.isArrayLiteralExpression(prop.initializer)) {
        result.testMatch = prop.initializer.elements
          .filter(ts.isStringLiteral)
          .map((el) => el.text);
      }
    }
  }

  return result;
}

/**
 * Resolve test file paths from a project directory.
 * Reads playwright.config.ts to determine testDir/testMatch via static analysis.
 * Falls back to `./tests/**\/*.spec.ts` if no config found.
 */
export function readTestFiles(
  cwd: string,
  opts?: { include?: string[] },
): TestFile[] {
  const config = parsePlaywrightConfig(cwd);

  const testDir = path.resolve(cwd, config.testDir ?? './tests');
  let testMatch: string[];

  if (opts?.include) {
    testMatch = opts.include;
  } else if (config.testMatch) {
    testMatch = Array.isArray(config.testMatch)
      ? config.testMatch
      : [config.testMatch];
  } else {
    testMatch = ['**/*.spec.ts'];
  }

  if (!fs.existsSync(testDir)) return [];

  const files = collectFiles(testDir, testMatch);
  return files.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    const source = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    return { path: filePath, source };
  });
}

function collectFiles(dir: string, patterns: string[]): string[] {
  const results: string[] = [];
  walkDir(dir, dir, patterns, results);
  return results.sort();
}

function walkDir(
  baseDir: string,
  currentDir: string,
  patterns: string[],
  results: string[],
): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkDir(baseDir, fullPath, patterns, results);
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, fullPath);
      if (matchesAny(rel, patterns)) {
        results.push(fullPath);
      }
    }
  }
}

function matchesAny(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (simpleGlobMatch(filePath, pattern)) return true;
  }
  return false;
}

/**
 * Simple glob matcher supporting ** and * patterns.
 * Sufficient for Playwright's testMatch patterns (e.g. "**\/*.spec.ts").
 * Handles "**\/" matching zero or more directories (including the root level).
 */
function simpleGlobMatch(filePath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '<<GLOBSTAR_SLASH>>')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<GLOBSTAR_SLASH>>/g, '(.*/)?')
    .replace(/<<GLOBSTAR>>/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

/**
 * Find all test(...) call expressions in a source file.
 * Includes test(), test.only(), test.skip(), and tests inside test.describe().
 */
export function findTestCalls(source: ts.SourceFile): ts.CallExpression[] {
  const results: ts.CallExpression[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isTestCall(node)) {
      results.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return results;
}

function isTestCall(node: ts.CallExpression): boolean {
  const expr = node.expression;

  // test('name', ...)
  if (ts.isIdentifier(expr) && expr.text === 'test') {
    return true;
  }

  // test.only('name', ...) or test.skip('name', ...)
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'test' &&
    (expr.name.text === 'only' || expr.name.text === 'skip')
  ) {
    return true;
  }

  return false;
}
