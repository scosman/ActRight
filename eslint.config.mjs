import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'test-results/',
      'tests/scripts/fixtures/',
    ],
  },
  {
    files: ['skill/scripts/**/*.ts', 'tests/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
  },
);
