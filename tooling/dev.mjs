import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import electronPath from 'electron';
import { buildMain } from './build.mjs';

await buildMain();
const server = await createServer();
await server.listen();
server.printUrls();
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const dataArgument = process.argv.find((argument) => argument.startsWith('--user-data-dir='));
let stopping = false;
let child;
let ready = false;
let reloadRequested = false;
let dirty = false;
let rebuilding;
let debounce;
const watchers = [];

function requestReload() {
  if (!stopping && ready && reloadRequested && child?.connected) child.send('DEV_RELOAD');
}
function launch() {
  ready = false;
  child = spawn(electronPath, ['dist/main.cjs', '--dev', ...(dataArgument ? [dataArgument] : [])], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env,
    windowsHide: false,
  });
  child.on('message', (message) => {
    if (message === 'DEV_READY') {
      ready = true;
      requestReload();
    }
  });
  child.on('error', () => {
    console.error('No se pudo iniciar Electron.');
    void stop(1);
  });
  child.on('exit', (code) => {
    ready = false;
    if (!stopping && reloadRequested && code === 0) {
      void (async () => {
        await rebuilding;
        if (stopping) return;
        reloadRequested = false;
        launch();
      })();
    } else void stop(code ?? 0);
  });
}
async function rebuild() {
  if (stopping || rebuilding) return;
  rebuilding = (async () => {
    while (dirty && !stopping) {
      dirty = false;
      try {
        await buildMain();
        reloadRequested = true;
      } catch {
        console.error('Main no compiló. Se conserva la instancia actual hasta corregir el código.');
        return;
      }
    }
    requestReload();
  })();
  try {
    await rebuilding;
  } finally {
    rebuilding = undefined;
  }
}
for (const path of [
  'apps/desktop/src',
  'packages/domain/src',
  'packages/shared/src',
  'tooling/build.mjs',
]) {
  watchers.push(
    watch(path, { recursive: !path.endsWith('.mjs') }, (_event, filename) => {
      if (
        path === 'apps/desktop/src' &&
        filename?.toString().replaceAll('\\', '/').startsWith('renderer/')
      )
        return;
      dirty = true;
      clearTimeout(debounce);
      debounce = setTimeout(() => void rebuild(), 200);
    }),
  );
}
launch();
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(debounce);
  for (const watcher of watchers) watcher.close();
  child?.kill();
  await server.close();
  process.exitCode = code;
}
process.on('SIGINT', () => {
  void stop();
});
process.on('SIGTERM', () => {
  void stop();
});
