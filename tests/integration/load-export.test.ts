import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { LoadExportService } from '../../apps/desktop/src/main/load-export-service';
import { FileLoadExportSink } from '../../apps/desktop/src/main/infrastructure/file-load-export';
import { historyRun } from '../helpers/load-history';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
let protectedDirectory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'load-export-'));
  protectedDirectory = join(directory, 'application');
  await mkdir(protectedDirectory);
});
afterEach(async () => {
  await removeTestDirectory(directory, 'load-export-');
});
const now = () => '2026-11-03T01:00:00.000Z';

describe('exportación de carga desde Main', () => {
  it.each(['CSV', 'JSON'] as const)(
    'guarda %s con nombre elegido sin devolver rutas ni contenido por IPC',
    async (format) => {
      const run = historyRun();
      const destination = join(directory, 'evidence.' + format.toLowerCase());
      await writeFile(destination, 'previous');
      const sink = new FileLoadExportSink(
        {
          choose: async (document) => {
            expect(Object.keys(document)).toEqual(['filename', 'format']);
            return destination;
          },
        },
        protectedDirectory,
      );
      const service = new LoadExportService(async () => ({ ok: true, value: run }), sink, now);
      expect(await service.export({ runId: run.runId, format })).toEqual({
        ok: true,
        value: 'SAVED',
      });
      expect(await readFile(destination, 'utf8')).toContain(run.runId);
      expect((await readdir(directory)).filter((file) => file.endsWith('.tmp'))).toEqual([]);
    },
  );
  it('cancelar conserva el archivo previo; fallos de destino no dejan temporales', async () => {
    const run = historyRun();
    const destination = join(directory, 'existing.json');
    await writeFile(destination, 'previous');
    const cancelled = new LoadExportService(
      async () => ({ ok: true, value: run }),
      new FileLoadExportSink({ choose: async () => null }, protectedDirectory),
      now,
    );
    expect(await cancelled.export({ runId: run.runId, format: 'JSON' })).toEqual({
      ok: true,
      value: 'CANCELLED',
    });
    expect(await readFile(destination, 'utf8')).toBe('previous');
    const failed = new LoadExportService(
      async () => ({ ok: true, value: run }),
      new FileLoadExportSink(
        { choose: async () => join(directory, 'missing', 'file.json') },
        protectedDirectory,
      ),
      now,
    );
    const result = await failed.export({ runId: run.runId, format: 'JSON' });
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain(directory);
    expect((await readdir(directory)).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });
  it('impide sobrescribir datos de la aplicación y destinos de otra extensión', async () => {
    const run = historyRun();
    const destination = join(protectedDirectory, 'preferences.json');
    await writeFile(destination, 'private');
    for (const path of [destination, join(directory, 'file.sqlite')]) {
      const service = new LoadExportService(
        async () => ({ ok: true, value: run }),
        new FileLoadExportSink({ choose: async () => path }, protectedDirectory),
        now,
      );
      expect(await service.export({ runId: run.runId, format: 'JSON' })).toMatchObject({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE' },
      });
    }
    expect(await readFile(destination, 'utf8')).toBe('private');
  });
  it('valida entradas y bloquea exportación activa o ausente antes del diálogo', async () => {
    let chosen = false;
    const run = historyRun({ state: 'RUNNING' });
    const service = new LoadExportService(
      async () => ({ ok: true, value: run }),
      {
        save: async () => {
          chosen = true;
          return 'SAVED';
        },
      },
      now,
    );
    expect(await service.export({ runId: run.runId, format: 'RAW' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await service.export({ runId: run.runId, format: 'JSON' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(chosen).toBe(false);
    const missing = new LoadExportService(
      async () => ({ ok: true, value: null }),
      {
        save: async () => {
          throw Error('must not save');
        },
      },
      now,
    );
    expect(await missing.export({ runId: run.runId, format: 'CSV' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    const unavailable = new LoadExportService(
      async () => ({ ok: false, error: { code: 'FORBIDDEN', message: 'QA only' } }),
      {
        save: async () => {
          throw Error('must not save');
        },
      },
      now,
    );
    expect(await unavailable.export({ runId: run.runId, format: 'JSON' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });
  it('timeout mantiene exclusión del diálogo e impide escritura si la selección llega tarde', async () => {
    const run = historyRun();
    const destination = join(directory, 'late.json');
    let release!: (path: string | null) => void;
    const choice = new Promise<string | null>((resolve) => {
      release = resolve;
    });
    const service = new LoadExportService(
      async () => ({ ok: true, value: run }),
      new FileLoadExportSink({ choose: () => choice }, protectedDirectory),
      now,
      20,
    );
    expect(await service.export({ runId: run.runId, format: 'JSON' })).toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT' },
    });
    expect(await service.export({ runId: run.runId, format: 'JSON' })).toMatchObject({
      ok: false,
      error: { code: 'IN_USE' },
    });
    release(destination);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await service.export({ runId: run.runId, format: 'JSON' })).toMatchObject({
      ok: true,
      value: 'SAVED',
    });
  });
  it('timeout de lookup no abre un diálogo posteriormente', async () => {
    const run = historyRun();
    let release!: () => void;
    let saved = false;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = new LoadExportService(
      async () => {
        await wait;
        return { ok: true, value: run };
      },
      {
        save: async () => {
          saved = true;
          return 'SAVED';
        },
      },
      now,
      10,
    );
    expect(await service.export({ runId: run.runId, format: 'CSV' })).toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT' },
    });
    release();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(saved).toBe(false);
  });
});
