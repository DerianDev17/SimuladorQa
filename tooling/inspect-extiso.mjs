import { open, mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { build } from 'esbuild';

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error('Usage: node tooling/inspect-extiso.mjs <source.bin> <artifacts/report.json>');
const destination = resolve(output);
const reportRelative = relative(resolve('artifacts'), destination);
if (!reportRelative || reportRelative.startsWith('..') || isAbsolute(reportRelative))
  throw new Error('EXTISO_REPORT_PATH_INVALID');
if (resolve(input) === destination) throw new Error('EXTISO_REPORT_OVERLAPS_SOURCE');
const compilation = await build({
  entryPoints: ['apps/desktop/src/main/adapters/extiso-definition-inspector.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { ExtisoDefinitionInspector } = await import(
  `data:text/javascript;base64,${Buffer.from(compilation.outputFiles[0].text).toString('base64')}`
);
const handle = await open(input, 'r');
const memory = Buffer.alloc(1_048_577);
try {
  const info = await handle.stat();
  if (!info.isFile()) throw new Error('EXTISO_SOURCE_INVALID');
  if (info.size > 1_048_576) throw new Error('EXTISO_SOURCE_TOO_LARGE');
  let offset = 0;
  while (offset < memory.length) {
    const { bytesRead } = await handle.read(memory, offset, memory.length - offset, null);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset > 1_048_576) throw new Error('EXTISO_SOURCE_TOO_LARGE');
  const source = memory.subarray(0, offset);
  const definition = new ExtisoDefinitionInspector().inspect(source);
  const report = {
    id: randomUUID(),
    analyzedAt: new Date().toISOString(),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    definition,
  };
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      id: report.id,
      sourceSha256: report.sourceSha256,
      bytesConsumed: definition.bytesConsumed,
      headerFields: definition.headerFields.length,
      fieldSlots: definition.fields.length,
      messageNames: definition.messageNames.length,
      definitionPairs: definition.definitionPairs.length,
      waitPairs: definition.waitPairs.length,
    }),
  );
} finally {
  memory.fill(0);
  await handle.close();
}
