import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { build } from 'esbuild';

const [host, port, output] = process.argv.slice(2);
if (!host || !port || !output)
  throw new Error(
    'Usage: node tooling/probe-visa-network.mjs <QA-IPv4> <port> <artifacts/report.json>',
  );
const destination = resolve(output);
const reportRelative = relative(resolve('artifacts'), destination);
if (!reportRelative || reportRelative.startsWith('..') || isAbsolute(reportRelative))
  throw new Error('NETWORK_REPORT_PATH_INVALID');
const compilation = await build({
  entryPoints: ['apps/desktop/src/main/adapters/qa-network-probe.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { QaNetworkProbe } = await import(
  `data:text/javascript;base64,${Buffer.from(compilation.outputFiles[0].text).toString('base64')}`
);
const result = await new QaNetworkProbe().observe({
  environment: 'QA',
  endpoint: { host, port: Number(port) },
  deadlineMs: 8000,
});
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
