import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { removeTestDirectory } from '../helpers/temporary-directory';

for (const state of ['minimized', 'hidden']) {
  test(`Main entrega estado ${state} al padre antes del reinicio`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'coonecta-window-'));
    const server = await createServer({
      configFile: resolve('vite.config.ts'),
      cacheDir: join(directory, 'vite'),
    });
    try {
      await server.listen();
      const address = server.httpServer!.address();
      if (!address || typeof address === 'string') throw Error('NO_SERVER');
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const binary = createRequire(import.meta.url)('electron') as string;
      const child = spawn(
        binary,
        [
          resolve('dist/main.cjs'),
          '--dev',
          `--dev-port=${address.port}`,
          `--dev-window-state=${state}`,
          `--user-data-dir=${directory}`,
          '--simulate-reader',
        ],
        {
          env,
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          windowsHide: false,
        },
      );
      const messages: unknown[] = [];
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const exited = new Promise<number | null>((resolveExit) => child.once('exit', resolveExit));
      try {
        await new Promise<void>((done, reject) => {
          timeout = setTimeout(() => reject(Error('DEV_RELOAD_TIMEOUT')), 12000);
          child.once('error', reject);
          child.on('message', (message: unknown) => {
            messages.push(message);
            if (message === 'DEV_READY') child.send('DEV_RELOAD');
          });
          child.once('exit', (code) => (code === 0 ? done() : reject(Error('DEV_RELOAD_FAILED'))));
        });
        expect(messages).toEqual(['DEV_READY', { type: 'DEV_WINDOW_STATE', state }]);
        expect(await exited).toBe(0);
      } finally {
        clearTimeout(timeout);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill();
          await exited;
        }
      }
    } finally {
      await server.close();
      await removeTestDirectory(directory, 'coonecta-window-');
    }
  });
}
