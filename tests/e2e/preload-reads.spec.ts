import { electronEnvironment } from '../helpers/electron-launch';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { removeTestDirectory } from '../helpers/temporary-directory';
import { channels } from '../../packages/shared/src/contracts';

test('preload aplica lecturas compartidas e independientes por IPC real', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coonecta-preload-reads-'));
  const harness = join(directory, 'main.cjs');
  await writeFile(
    harness,
    `const { app, BrowserWindow, ipcMain } = require('electron');
globalThis.readCounts = { catalog: 0 };
for (const channel of ${JSON.stringify([channels.inspectQaAtm, channels.mediatorLive])}) {
  ipcMain.handle(channel, async () => {
    const sequence = globalThis.readCounts[channel] = (globalThis.readCounts[channel] ?? 0) + 1;
    await new Promise(resolve => setTimeout(resolve, sequence === 1 ? 50 : 0));
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Synthetic ' + sequence } };
  });
}
ipcMain.handle('catalog:list', async (_event, request) => {
  globalThis.readCounts.catalog++;
  await new Promise(resolve => setTimeout(resolve, 50));
  return request.environment === 'QA'
    ? { ok: true, value: { environment: 'QA', entities: [], atms: [] } }
    : { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Ambiente inválido.' } };
});
app.whenReady().then(() => {
  const window = new BrowserWindow({ show: false, webPreferences: {
    preload: ${JSON.stringify(resolve('dist/preload.cjs'))},
    contextIsolation: true, nodeIntegration: false, sandbox: true,
  } });
  window.loadURL('about:blank');
});`,
  );
  const env = electronEnvironment();
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({ args: [harness, `--user-data-dir=${directory}`], env });
    const window = await app.firstWindow();
    const results = await window.evaluate(() => {
      const api = globalThis.window.desktop!;
      return Promise.all([
        api.getCatalog('QA'),
        api.getCatalog('QA'),
        api.getCatalog('QA'),
        // Deliberately bypass the public type to exercise invalid IPC input.
        api.getCatalog('PROD' as unknown as Parameters<typeof api.getCatalog>[0]),
      ]);
    });
    expect(results.slice(0, 3)).toEqual(
      Array.from({ length: 3 }, () => ({
        ok: true,
        value: { environment: 'QA', entities: [], atms: [] },
      })),
    );
    expect(results[3]).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    const count = () =>
      app!.evaluate(
        () => (globalThis as unknown as { readCounts: { catalog: number } }).readCounts.catalog,
      );
    expect(await count()).toBe(2);
    await window.evaluate(() => globalThis.window.desktop!.getCatalog('QA'));
    expect(await count()).toBe(3);
    const independent = await window.evaluate(() => {
      const api = globalThis.window.desktop!;
      const atm = {
        environment: 'QA',
        atmId: '59ce13ca-6fb8-4f38-a0c9-823ddb5ba605',
        revision: 1,
      } as const;
      const feed = {
        mode: 'live',
        environment: 'QA',
        entityId: 205,
        channelId: 1,
        limit: 50,
      } as const;
      return Promise.all([
        api.inspectQaAtm(atm),
        api.inspectQaAtm(atm),
        api.getMediatorLive(feed),
        api.getMediatorLive(feed),
      ]);
    });
    expect(independent).toEqual(
      [1, 2, 1, 2].map((sequence) => ({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `Synthetic ${sequence}` },
      })),
    );
  } finally {
    await app?.close();
    await removeTestDirectory(directory, 'coonecta-preload-reads-');
  }
});
