import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteLoadRunStore } from '../../apps/desktop/src/main/infrastructure/sqlite-load-run-store';
import { LoadHistoryService } from '../../apps/desktop/src/main/load-history-service';
import { LoadRunService } from '../../apps/desktop/src/main/load-run-service';
import { historyRun } from '../helpers/load-history';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
let store: SqliteLoadRunStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'load-history-'));
  store = new SqliteLoadRunStore(join(directory, 'runs.sqlite'), join(directory, 'legacy.json'));
});
afterEach(async () => {
  await store.close();
  await removeTestDirectory(directory, 'load-history-');
});
const preferences = {
  read: async () => ({ version: 1 as const, environment: 'QA' as const, audit: [] }),
};
const recovered = async () => ({ ok: true as const, value: null });

describe('historial de carga persistente', () => {
  it('pagina sin duplicados aunque se agregue una corrida, y recupera detalle tras reiniciar', async () => {
    const runs = Array.from({ length: 25 }, () => historyRun());
    for (const run of runs) await store.write(run);
    const first = await store.list({});
    expect(first.entries).toHaveLength(20);
    expect(first.entries[0]?.runId).toBe(runs.at(-1)!.runId);
    expect(first.entries[0]?.metrics).toMatchObject({ sent: 1, approved: 1, tps: 1, p95: 100 });
    await store.write(historyRun());
    const second = await store.list({ before: first.next! });
    expect(second.entries.map((row) => row.runId)).toEqual(
      runs
        .slice(0, 5)
        .reverse()
        .map((run) => run.runId),
    );
    expect(second.next).toBeNull();
    await store.close();
    expect(await store.get(runs[0]!.runId)).toEqual(runs[0]);
    expect(await store.get(randomUUID())).toBeNull();
    expect((await store.list({})).entries).toHaveLength(20);
  });
  it('combina fechas, operación, estado y ATM secundario sin cambiar el último resultado', async () => {
    const first = historyRun();
    const secondary = randomUUID();
    first.draft = {
      ...first.draft,
      operation: 'WITHDRAWAL',
      amount: '25.50',
      additionalAtms: [{ atmId: secondary, atmRevision: 1 }],
    };
    first.state = 'FAILED';
    await store.write(first);
    const latest = historyRun({ startedAt: '2026-11-03T00:00:00.000Z' });
    await store.write(latest);
    const query = {
      from: first.startedAt,
      to: latest.startedAt,
      operation: 'WITHDRAWAL' as const,
      state: 'FAILED' as const,
      atmId: secondary,
    };
    expect((await store.list(query)).entries.map((row) => row.runId)).toEqual([first.runId]);
    expect((await store.list({ ...query, state: 'COMPLETED' })).entries).toEqual([]);
    expect(await store.read()).toEqual(latest);
    await expect(store.list({ atmId: "' OR 1=1" })).rejects.toThrow('LOAD_HISTORY_INVALID');
    await expect(store.get('../file')).rejects.toThrow('LOAD_RUN_INVALID');
  });
  it('recupera una corrida interrumpida antes de consultar, sin ejecutar ni reanudar', async () => {
    const run = historyRun({ state: 'RUNNING', active: 1, finishedAt: null });
    await store.write(run);
    const runtime = {
      agentId: randomUUID(),
      hostname: 'test',
      user: 'test',
      version: 'test',
      uuid: randomUUID,
      now: () => '2026-11-03T00:00:00.000Z',
    };
    const active = new LoadRunService(
      runtime,
      {
        prepare: async () => {
          throw Error('must not execute');
        },
      },
      store,
      () => {
        throw Error('must not schedule');
      },
    );
    const service = new LoadHistoryService(store, preferences, () => active.current(undefined));
    expect(await service.get({ runId: run.runId })).toMatchObject({
      ok: true,
      value: { state: 'INTERRUPTED', active: 0 },
    });
    expect(await service.list({ state: 'INTERRUPTED' })).toMatchObject({
      ok: true,
      value: { entries: [{ runId: run.runId }] },
    });
  });
  it('controla validación, ambiente y fallos de dependencias con errores públicos', async () => {
    const service = new LoadHistoryService(store, preferences, recovered);
    expect(await service.list({ state: 'UNKNOWN' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await service.get({ runId: 'bad' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    const preprod = new LoadHistoryService(
      store,
      { read: async () => ({ version: 1, environment: 'PREPROD', audit: [] }) },
      recovered,
    );
    expect(await preprod.list({})).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const broken = new LoadHistoryService(
      store,
      {
        read: async () => {
          throw Error('private credential');
        },
      },
      recovered,
    );
    const result = await broken.list({});
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private credential');
  });
  it('maneja bloqueo SQLite y corrupción sin devolver una lista vacía ni sustituir datos', async () => {
    const run = historyRun();
    await store.write(run);
    const service = new LoadHistoryService(store, preferences, recovered);
    const external = new DatabaseSync(join(directory, 'runs.sqlite'));
    try {
      external.exec('BEGIN EXCLUSIVE');
      expect(await service.list({})).toMatchObject({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE' },
      });
      external.exec('ROLLBACK');
      expect(await service.list({})).toMatchObject({ ok: true });
      external.prepare('UPDATE runs SET payload = ? WHERE run_id = ?').run('{private', run.runId);
      expect(await service.get({ runId: run.runId })).toMatchObject({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE' },
      });
      expect(await service.list({})).toMatchObject({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE' },
      });
      expect(external.prepare('SELECT payload FROM runs').get()?.payload).toBe('{private');
    } finally {
      external.close();
    }
  });
});
