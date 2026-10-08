import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { syntheticExtisoDefinition } from '../helpers/extiso-definition';
import { removeTestDirectory } from '../helpers/temporary-directory';

const execute = promisify(execFile);

describe('herramienta offline EXTISO', () => {
  it('lee archivo y publica solo evidencia sin defaults privados', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'extiso-inspection-'));
    const source = join(directory, 'definition.bin');
    const output = resolve('artifacts', `extiso-test-${randomUUID()}.json`);
    try {
      await writeFile(source, syntheticExtisoDefinition());
      const { stdout } = await execute(
        process.execPath,
        ['tooling/inspect-extiso.mjs', source, output],
        {
          timeout: 30_000,
          windowsHide: true,
        },
      );
      const report = await readFile(output, 'utf8');
      expect(JSON.parse(stdout)).toMatchObject({ fieldSlots: 128, messageNames: 1 });
      expect(JSON.parse(report).definition.fields[41]).toMatchObject({
        encodingLabel: 'EBCDIC',
        lengthParameter: 8,
      });
      expect(report + stdout).not.toContain('synthetic-private-default');
      expect(JSON.parse(report).analyzedAt).toMatch(/Z$/);
    } finally {
      await rm(output, { force: true });
      await removeTestDirectory(directory, 'extiso-inspection-');
    }
  });
  it('no publica informe cuando la dependencia de archivo no esta disponible', async () => {
    const output = resolve('artifacts', `extiso-test-${randomUUID()}.json`);
    await expect(
      execute(
        process.execPath,
        ['tooling/inspect-extiso.mjs', join(tmpdir(), `absent-${randomUUID()}.bin`), output],
        { timeout: 30_000, windowsHide: true },
      ),
    ).rejects.toThrow();
    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rechaza escribir fuera de artifacts antes de leer la fuente', async () => {
    await expect(
      execute(
        process.execPath,
        [
          'tooling/inspect-extiso.mjs',
          'absent.bin',
          join(tmpdir(), `outside-${randomUUID()}.json`),
        ],
        { timeout: 30_000, windowsHide: true },
      ),
    ).rejects.toThrow('EXTISO_REPORT_PATH_INVALID');
  });
  it('rechaza usar la fuente como destino del informe', async () => {
    const path = resolve('artifacts', `extiso-test-${randomUUID()}.bin`);
    await expect(
      execute(process.execPath, ['tooling/inspect-extiso.mjs', path, path], {
        timeout: 30_000,
        windowsHide: true,
      }),
    ).rejects.toThrow('EXTISO_REPORT_OVERLAPS_SOURCE');
  });
  it('no publica ni modifica una fuente corrupta', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'extiso-inspection-'));
    const source = join(directory, 'definition.bin');
    const output = resolve('artifacts', `extiso-test-${randomUUID()}.json`);
    const malformed = syntheticExtisoDefinition().subarray(0, 261);
    try {
      await writeFile(source, malformed);
      await expect(
        execute(process.execPath, ['tooling/inspect-extiso.mjs', source, output], {
          timeout: 30_000,
          windowsHide: true,
        }),
      ).rejects.toThrow('EXTISO_DEFINITION_INVALID');
      await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(source)).toEqual(malformed);
    } finally {
      await rm(output, { force: true });
      await removeTestDirectory(directory, 'extiso-inspection-');
    }
  });
});
