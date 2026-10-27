import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteLoadRunStore } from '../../apps/desktop/src/main/infrastructure/sqlite-load-run-store';
import { FileLoadRunStore } from '../../apps/desktop/src/main/infrastructure/load-run-store';
import type { LoadRunSnapshot } from '../../packages/domain/src/load-run';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-load-sqlite-'));
});
afterEach(async () => {
  await removeTestDirectory(directory, 'coonecta-load-sqlite-');
});

function snapshot(): LoadRunSnapshot {
  return {
    runId: randomUUID(),
    requestId: randomUUID(),
    draft: {
      environment: 'QA',
      operation: 'BALANCE',
      mode: 'LOAD',
      atmId: randomUUID(),
      atmRevision: 1,
      targetTps: 1,
      concurrency: 1,
      maxTransactions: 1,
      durationSeconds: 60,
      rampUpSeconds: 0,
    },
    startedAt: '2026-10-26T15:00:00.000Z',
    finishedAt: '2026-10-26T15:00:01.000Z',
    state: 'COMPLETED',
    message: 'Corrida completada.',
    active: 0,
    elapsedMs: 1000,
    items: [],
  };
}

describe('historial de carga SQLite', () => {
  it('persiste tiempos monotónicos, conserva compatibilidad y rechaza offsets inválidos', async () => {
    const databasePath = join(directory, 'qa-load-runs.sqlite');
    const legacyPath = join(directory, 'qa-load-runs.json');
    const store = new SqliteLoadRunStore(databasePath, legacyPath);
    const run = snapshot();
    run.items = [
      {
        requestId: randomUUID(),
        transactionId: randomUUID(),
        outcome: 'APPROVED',
        sent: true,
        received: true,
        responseCode: '00',
        elapsedMs: 100,
        correlation: null,
        finishedAt: run.finishedAt!,
        finishedElapsedMs: 800,
      },
    ];
    try {
      await store.write(run);
      for (const invalid of [-1, 1.5, Infinity, NaN]) {
        const broken = structuredClone(run);
        broken.items[0]!.finishedElapsedMs = invalid;
        await expect(store.write(broken)).rejects.toThrow('LOAD_RUN_INVALID');
      }
    } finally {
      await store.close();
    }
    const reopened = new SqliteLoadRunStore(databasePath, legacyPath);
    try {
      expect(await reopened.read()).toEqual(run);
    } finally {
      await reopened.close();
    }
  });
  it('migra 100 corridas y conserva sus solicitudes al registrar la 101', async () => {
    const legacyPath = join(directory, 'qa-load-runs.json');
    const databasePath = join(directory, 'qa-load-runs.sqlite');
    const legacy = Array.from({ length: 100 }, snapshot);
    await writeFile(legacyPath, JSON.stringify(legacy));
    const original = await readFile(legacyPath, 'utf8');
    const store = new SqliteLoadRunStore(databasePath, legacyPath);
    expect(await store.read()).toEqual(legacy.at(-1));
    expect(await store.hasRequest(legacy[0]!.requestId)).toBe(true);
    const next = snapshot();
    await store.write(next);
    expect(await store.read()).toEqual(next);
    await store.close();

    const reopened = new SqliteLoadRunStore(databasePath, legacyPath);
    expect(await reopened.hasRequest(legacy[0]!.requestId)).toBe(true);
    expect(await reopened.hasRequest(next.requestId)).toBe(true);
    expect(await reopened.read()).toEqual(next);
    expect(await readFile(legacyPath, 'utf8')).toBe(original);
    await reopened.close();
  });

  it('actualiza una corrida sin duplicarla ni cambiar la solicitud original', async () => {
    const store = new SqliteLoadRunStore(
      join(directory, 'qa-load-runs.sqlite'),
      join(directory, 'qa-load-runs.json'),
    );
    const first = snapshot();
    await store.write(first);
    await store.write({ ...first, state: 'FAILED', message: 'Error sintético.' });
    expect(await store.read()).toMatchObject({
      runId: first.runId,
      requestId: first.requestId,
      state: 'FAILED',
    });
    await expect(store.write({ ...snapshot(), requestId: first.requestId })).rejects.toThrow(
      'LOAD_RUN_DUPLICATE_REQUEST',
    );
    await expect(store.write({ ...first, requestId: randomUUID() })).rejects.toThrow(
      'LOAD_RUN_INVALID',
    );
    expect(await store.read()).toMatchObject({ requestId: first.requestId, state: 'FAILED' });
    await store.close();
  });

  it('bloquea un JSON anterior corrupto sin reemplazarlo', async () => {
    const legacyPath = join(directory, 'qa-load-runs.json');
    await writeFile(legacyPath, 'corrupt-private');
    const store = new SqliteLoadRunStore(join(directory, 'qa-load-runs.sqlite'), legacyPath);
    await expect(store.read()).rejects.toThrow();
    expect(await readFile(legacyPath, 'utf8')).toBe('corrupt-private');
    await writeFile(legacyPath, '[]');
    expect(await store.read()).toBeNull();
    await store.close();
  });

  it('rechaza identificadores duplicados también en el adaptador JSON anterior', async () => {
    const store = new FileLoadRunStore(join(directory, 'qa-load-runs.json'));
    const first = snapshot();
    await store.write(first);
    await expect(store.write({ ...snapshot(), requestId: first.requestId })).rejects.toThrow(
      'LOAD_RUN_DUPLICATE_REQUEST',
    );
    await expect(store.write({ ...first, requestId: randomUUID() })).rejects.toThrow(
      'LOAD_RUN_INVALID',
    );
    expect(await store.read()).toEqual(first);
  });
});
