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
const child = spawn(electronPath, ['dist/main.cjs', '--dev'], {
  stdio: 'inherit',
  env,
  windowsHide: true,
});
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
