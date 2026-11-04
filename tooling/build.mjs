import { build as buildElectron } from 'esbuild';
import { build as buildRenderer } from 'vite';
import { copyFile, readFile } from 'node:fs/promises';

export async function buildMain() {
  await buildElectron({
    entryPoints: {
      main: 'apps/desktop/src/main/index.ts',
      'load-worker': 'apps/desktop/src/main/infrastructure/load-worker.ts',
      preload: 'apps/desktop/src/preload.ts',
      'catalog-worker': 'apps/desktop/src/main/infrastructure/catalog-worker.ts',
    },
    outdir: 'dist',
    outExtension: { '.js': '.cjs' },
    platform: 'node',
    format: 'cjs',
    bundle: true,
    external: ['electron'],
    target: 'node22',
    sourcemap: true,
  });
  for (const name of [
    'mediator-query.ps1',
    'mediator-live-query.ps1',
    'mediator-redaction.ps1',
    'mediator-command.ps1',
    'cms-financial-fields.json',
    'pcsc-status.ps1',
    'pcsc-monitor.ps1',
    'pcsc-card.ps1',
    'qa-pin-entry.ps1',
    'qa-pin-cipher.ps1',
  ]) {
    const source = `apps/desktop/src/main/adapters/${name}`;
    const destination = `dist/${name}`;
    // PowerShell can hold a running script open on Windows. Leave identical
    // runtime assets in place; changed assets must still copy successfully.
    const contents = await readFile(source);
    try {
      if (contents.equals(await readFile(destination))) continue;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await copyFile(source, destination);
  }
}

if (process.argv[1]?.endsWith('build.mjs')) {
  await buildMain();
  await buildRenderer();
}
