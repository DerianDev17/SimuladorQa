import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { builtinModules } from 'node:module';
import boundaries from './tooling/architecture-boundaries.json' with { type: 'json' };

const nativeModules = [
  ...new Set(
    builtinModules.flatMap((name) => {
      const bare = name.replace(/^node:/, '');
      return [bare, `node:${bare}`];
    }),
  ),
];

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
    files: boundaries.protectedMainFiles.map((name) => `apps/desktop/src/main/${name}`),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nativeModules.filter((name) => name !== 'node:perf_hooks'),
          patterns: [
            '**/adapters/**',
            '**/infrastructure/**',
            '**/renderer/**',
            'electron',
            ...boundaries.concreteMainModules.flatMap((name) => [`**/${name}`, `**/${name}.*`]),
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
