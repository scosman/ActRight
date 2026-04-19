import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import path from 'path';
import fs from 'fs';
import { main } from '../../scripts/list-fixtures.js';
import { findTestCalls, getTestName } from '../../scripts/lib/ast.js';

const fixturesDir = path.resolve(__dirname, 'fixtures');

describe('list-fixtures', () => {
  it('finds a single test.extend({ loggedIn: async ({...}, use) => {...} }) call', async () => {
    const fixtureFile = path.join(fixturesDir, 'basic', 'tests', 'fixtures.ts');
    const result = await main(['--fixture-files', fixtureFile]);
    const output = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output.fixtures.length).toBeGreaterThanOrEqual(1);
    const loggedIn = output.fixtures.find(
      (f: { name: string }) => f.name === 'loggedIn',
    );
    expect(loggedIn).toBeDefined();
    expect(loggedIn.type).toBe('async fixture');
  });

  it('reports dependencies: ["signedUp"] when the fixture destructures another fixture', async () => {
    const fixtureFile = path.join(fixturesDir, 'basic', 'tests', 'fixtures.ts');
    const result = await main(['--fixture-files', fixtureFile]);
    const output = JSON.parse(result.stdout);

    const loggedIn = output.fixtures.find(
      (f: { name: string }) => f.name === 'loggedIn',
    );
    expect(loggedIn).toBeDefined();
    expect(loggedIn.dependencies).toContain('signedUp');
  });

  it('reports docstring when a JSDoc comment precedes the fixture property', async () => {
    const fixtureFile = path.join(fixturesDir, 'basic', 'tests', 'fixtures.ts');
    const result = await main(['--fixture-files', fixtureFile]);
    const output = JSON.parse(result.stdout);

    const loggedIn = output.fixtures.find(
      (f: { name: string }) => f.name === 'loggedIn',
    );
    expect(loggedIn).toBeDefined();
    expect(loggedIn.docstring).toContain('logs in');
  });

  it('handles a fixtures file with zero test.extend calls — returns empty list', async () => {
    // Use the hand-written spec file which has no test.extend
    const fixtureFile = path.join(
      fixturesDir,
      'basic',
      'tests',
      'hand-written.spec.ts',
    );
    const result = await main(['--fixture-files', fixtureFile]);
    const output = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output.fixtures).toEqual([]);
  });

  it('findTestCalls picks up test.skip() and test.only() variants', () => {
    const loginSpec = path.join(fixturesDir, 'basic', 'tests', 'login.spec.ts');
    const content = fs.readFileSync(loginSpec, 'utf-8');
    const source = ts.createSourceFile(
      loginSpec,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const calls = findTestCalls(source);
    const names = calls.map((c) => getTestName(c));
    expect(names).toContain('expired session redirect');
  });

  it('handles a malformed fixtures file — returns errors, does not throw', async () => {
    const fixtureFile = path.join(
      fixturesDir,
      'malformed-fixtures',
      'tests',
      'fixtures.ts',
    );
    const result = await main(['--fixture-files', fixtureFile]);
    const output = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output.errors).toBeDefined();
    expect(output.errors.length).toBeGreaterThan(0);
    expect(output.errors[0].file).toContain('fixtures.ts');
  });
});
