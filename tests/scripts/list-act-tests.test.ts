import { describe, it, expect } from 'vitest';
import path from 'path';
import { main } from '../../skill/scripts/list-act-tests.js';

const fixturesDir = path.resolve(__dirname, 'fixtures');

describe('list-act-tests', () => {
  it('lists all act-managed tests in a multi-file fixture project', async () => {
    const result = await main(['--cwd', path.join(fixturesDir, 'basic')]);
    const output = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output.tests).toHaveLength(2);
    const validCreds = output.tests.find(
      (t: { testName: string }) => t.testName === 'valid credentials',
    );
    expect(validCreds).toBeDefined();
    expect(validCreds.docstring).toBeDefined();
    expect(validCreds.docstring.sections.goals).toContain('signs in');
  });

  it('ignores hand-written tests (no @act) but lists them under nonActTests', async () => {
    const result = await main(['--cwd', path.join(fixturesDir, 'basic')]);
    const output = JSON.parse(result.stdout);

    expect(output.nonActTests).toHaveLength(1);
    expect(output.nonActTests[0].testName).toBe('hand-written sanity');
  });

  it('reports orphan @act comments under orphanDocstrings', async () => {
    const result = await main(['--cwd', path.join(fixturesDir, 'orphan')]);
    const output = JSON.parse(result.stdout);

    expect(output.orphanDocstrings.length).toBeGreaterThanOrEqual(1);
    expect(output.orphanDocstrings[0].startLine).toBeGreaterThan(0);
  });

  it('honors a custom testDir set in playwright.config.ts', async () => {
    const result = await main([
      '--cwd',
      path.join(fixturesDir, 'custom-testdir'),
    ]);
    const output = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output.tests).toHaveLength(1);
    expect(output.tests[0].testName).toBe('app loads');
    expect(output.tests[0].file).toContain('e2e');
  });

  it('picks up test.skip() variants via findTestCalls', async () => {
    const result = await main(['--cwd', path.join(fixturesDir, 'basic')]);
    const output = JSON.parse(result.stdout);

    const skipped = output.tests.find(
      (t: { testName: string }) => t.testName === 'expired session redirect',
    );
    expect(skipped).toBeDefined();
    expect(skipped.docstring).toBeDefined();
    expect(skipped.docstring.sections.goals).toContain('expired sessions');
  });

  it('returns empty arrays when no tests exist', async () => {
    const result = await main(['--cwd', path.join(fixturesDir, 'empty')]);
    const output = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output.tests).toEqual([]);
    expect(output.nonActTests).toEqual([]);
    expect(output.orphanDocstrings).toEqual([]);
  });
});
