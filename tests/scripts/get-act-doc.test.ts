import { describe, it, expect } from 'vitest';
import path from 'path';
import { main } from '../../skill/scripts/get-act-doc.js';

const fixturesDir = path.resolve(__dirname, 'fixtures');

describe('get-act-doc', () => {
  it('returns the parsed docstring for a given file + test name', async () => {
    const file = path.join(fixturesDir, 'basic', 'tests', 'login.spec.ts');
    const result = await main([file, 'valid credentials']);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.sections.goals).toContain('signs in');
    expect(output.sections.assertions).toContain('/dashboard');
    expect(output.body).toContain('Goals');
  });

  it('returns {"error":"not found"} with exit 1 when the test name is absent', async () => {
    const file = path.join(fixturesDir, 'basic', 'tests', 'login.spec.ts');
    const result = await main([file, 'nonexistent test']);

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.error).toBe('not found');
  });
});
