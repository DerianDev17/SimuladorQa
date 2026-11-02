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
    files: [
      'apps/desktop/src/main/financial-execution-service.ts',
      'apps/desktop/src/main/financial-execution-context.ts',
      'apps/desktop/src/main/financial-message-contract.ts',
      'apps/desktop/src/main/financial-execution-port.ts',
      'apps/desktop/src/main/balance-ports.ts',
      'apps/desktop/src/main/load-ports.ts',
      'apps/desktop/src/main/load-run-service.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/adapters/**',
            '**/infrastructure/**',
            '**/renderer/**',
            'electron',
            './application',
            './balance-inquiry-service',
            './withdrawal-service',
            './card-identity-service',
            'node:net',
            'node:tls',
            'node:fs',
            'node:fs/*',
            'node:child_process',
            'node:sqlite',
            'node:worker_threads',
          ],
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
