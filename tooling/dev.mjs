import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { buildMain } from './build.mjs';

await buildMain();
const server = await createServer();
await server.listen();
server.printUrls();
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const dataArgument = process.argv.find((argument) => argument.startsWith('--user-data-dir='));
const child = spawn(
  electronPath,
  ['dist/main.cjs', '--dev', ...(dataArgument ? [dataArgument] : [])],
  {
    stdio: 'inherit',
    env,
    // Electron es la app visible: SW_HIDE tambien oculta su ventana en Windows.
    windowsHide: false,
  },
);
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  child.kill();
  await server.close();
  process.exitCode = code;
}
child.on('error', () => {
  console.error('No se pudo iniciar Electron.');
  void stop(1);
});
child.on('exit', (code) => {
  void stop(code ?? 0);
});
process.on('SIGINT', () => {
  void stop();
});
process.on('SIGTERM', () => {
  void stop();
});
