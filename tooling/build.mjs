import { build as buildElectron } from 'esbuild';
import { build as buildRenderer } from 'vite';
import { copyFile, readFile, writeFile } from 'node:fs/promises';

export async function buildMain() {
  await buildElectron({
    entryPoints: {
      main: 'apps/desktop/src/main/index.ts',
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
    'mediator-redaction.ps1',
    'mediator-command.ps1',
    'cms-financial-fields.json',
    'pcsc-status.ps1',
    'pcsc-card.ps1',
  ]) {
    await copyFile(`apps/desktop/src/main/adapters/${name}`, `dist/${name}`);
  }
}

if (process.argv[1]?.endsWith('build.mjs')) {
  await buildMain();
  await buildRenderer();
  const path = 'dist/renderer/index.html';
  const html = await readFile(path, 'utf8');
  await writeFile(
    path,
    html
      .replace("connect-src 'self' ws://127.0.0.1:5173", "connect-src 'none'")
      .replace("style-src 'self' 'unsafe-inline'", "style-src 'self'")
      .replace("script-src 'self' 'unsafe-inline'", "script-src 'self'"),
  );
}
