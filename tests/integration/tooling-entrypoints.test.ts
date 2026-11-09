import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('puntos de entrada de los comandos desktop', () => {
  it.each(['dev', 'start', 'build'])(
    '%s resuelve sus módulos locales sin ejecutarlos',
    async (command) => {
      const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
        scripts: Record<string, string>;
      };
      const script = manifest.scripts[command];
      expect(script).toMatch(/^node tooling\/[\w-]+\.mjs$/);
      const result = await build({
        entryPoints: [script!.slice('node '.length)],
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'esm',
        write: false,
        logLevel: 'silent',
      });
      expect(result.errors).toEqual([]);
    },
  );
});
