import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { builtinModules } from 'node:module';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'test-results/**', 'artifacts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'apps/desktop/src/renderer/**/*.{ts,tsx}',
      'packages/domain/**/*.ts',
      'packages/shared/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: builtinModules,
          patterns: ['node:*', 'electron', '**/main/**', '**/infrastructure/**'],
        },
      ],
    },
  },
  {
    files: ['tooling/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
);
