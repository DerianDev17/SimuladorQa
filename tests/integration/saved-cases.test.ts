import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import { WorkerCatalogStore } from '../../apps/desktop/src/main/infrastructure/worker-catalog-store';
import { SqliteCatalog } from '../../apps/desktop/src/main/infrastructure/sqlite-catalog';
import { FilePreferencesStore } from '../../apps/desktop/src/main/infrastructure/preferences-store';
import { CmsV36Catalog } from '../../apps/desktop/src/main/adapters/cms-v36-catalog';
import type { CatalogSnapshot } from '../../packages/domain/src/catalogs';
import type { SaveCaseRequest } from '../../packages/domain/src/saved-cases';
import type { Result } from '../../packages/shared/src/contracts';
import { removeTestDirectory } from '../helpers/temporary-directory';

const identity = {
  agentId: randomUUID(),
  hostname: 'test-machine',
  user: 'test-user',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-10-07T12:00:00.000Z',
};
const context = { user: identity.user, machine: identity.hostname, timestamp: identity.now() };
const request: SaveCaseRequest = {
  environment: 'QA',
  id: null,
  revision: null,
  values: {
    name: 'Consulta sintética',
    draft: {
      environment: 'QA',
      transaction: 'BALANCE',
      scenario: 'BANRED',
      atmId: null,
      atmRevision: null,
      account: 'CURRENT',
      amount: null,
    },
  },
};
function value(result: Result<CatalogSnapshot>) {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe('casos con Main, Worker y SQLite reales', () => {
  let directory: string;
  let script: string;
  let file: string;
  let preferences: FilePreferencesStore;
  let store: WorkerCatalogStore;
  let application: DesktopApplication;
  const stores: WorkerCatalogStore[] = [];
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-cases-'));
    script = join(directory, 'catalog-worker.cjs');
    await build({
      entryPoints: [resolve('apps/desktop/src/main/infrastructure/catalog-worker.ts')],
      outfile: script,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
    });
  });
  function start() {
    store = new WorkerCatalogStore(script, file);
    stores.push(store);
    application = new DesktopApplication(preferences, identity, store, new CmsV36Catalog());
  }
  beforeEach(() => {
    file = join(directory, `${randomUUID()}.sqlite`);
    preferences = new FilePreferencesStore(join(directory, `${randomUUID()}.json`));
    start();
  });
  afterEach(async () => {
    await store.close();
  });
  afterAll(async () => {
    await Promise.all(stores.map((item) => item.close()));
    await removeTestDirectory(directory, 'coonecta-cases-');
  });
  async function list() {
    return value(await application.catalog('list', { environment: 'QA' }));
  }
  async function seedAtm() {
    const entity = value(
      await application.catalog('saveEntity', {
        environment: 'QA',
        id: null,
        revision: null,
        values: { code: 'TEST', name: 'Synthetic Entity', networkType: 'COONECTA', active: true },
      }),
    ).entities[0]!;
    return value(
      await application.catalog('saveAtm', {
        environment: 'QA',
        id: null,
        revision: null,
        values: {
          alias: 'Synthetic ATM',
          entityId: entity.id,
          terminalId: 'TEST',
          acquirerId: 'TEST',
          active: true,
        },
      }),
    ).atms[0]!;
  }
  it('guarda, reabre, actualiza y elimina un caso con auditoría sin valores', async () => {
    const saved = value(await application.catalog('saveCase', request)).cases[0]!;
    expect(saved).toMatchObject({
      revision: 1,
      status: 'DRAFT',
      createdAt: identity.now(),
      environment: 'QA',
    });
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.evidenceDocuments).toContain('docs/protocols/PCAP_REVIEW.md');
    await store.close();
    start();
    expect((await list()).cases[0]).toEqual(saved);
    const updated = value(
      await application.catalog('saveCase', {
        ...request,
        id: saved.id,
        revision: 1,
        values: { ...request.values, name: 'Consulta editada' },
      }),
    ).cases[0]!;
    expect(updated).toMatchObject({
      revision: 2,
      name: 'Consulta editada',
      createdAt: saved.createdAt,
    });
    const result = value(
      await application.catalog('deleteCase', { environment: 'QA', id: saved.id, revision: 2 }),
    );
    expect(result.cases).toEqual([]);
    expect(result.audit.map((entry) => entry.action)).toEqual(['DELETED', 'UPDATED', 'CREATED']);
    expect(result.audit.every((entry) => entry.resource === 'CASE')).toBe(true);
    expect(JSON.stringify(result.audit)).not.toContain('Consulta');
  });
  it('conserva expectativas editadas sin alterar el borrador ni su aislamiento', async () => {
    const original = value(await application.catalog('saveCase', request)).cases[0]!;
    expect(original.expectation).toBeUndefined();
    const expectation = {
      outcome: 'NOT_APPROVED' as const,
      responseCode: '05',
      source: 'docs/transactions/BALANCE_INQUIRY.md',
    };
    const updated = value(
      await application.catalog('saveCase', {
        ...request,
        id: original.id,
        revision: original.revision,
        values: { ...request.values, expectation },
      }),
    ).cases[0]!;
    expect(updated.expectation).toEqual(expectation);
    expect(updated.draft).toEqual(original.draft);
    await store.close();
    start();
    expect((await list()).cases[0]?.expectation).toEqual(expectation);
    const without = value(
      await application.catalog('saveCase', {
        ...request,
        id: updated.id,
        revision: updated.revision,
      }),
    ).cases[0]!;
    expect(without.expectation).toBeUndefined();
    expect(without.revision).toBe(updated.revision + 1);
  });
  it('mantiene QA/PREPROD separados y rechaza ambiente obsoleto, PROD y evidencia externa', async () => {
    const saved = value(await application.catalog('saveCase', request)).cases[0]!;
    await application.setEnvironment({ environment: 'PREPROD' });
    expect(await application.catalog('saveCase', request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(value(await application.catalog('list', { environment: 'PREPROD' })).cases).toEqual([]);
    expect(
      await application.catalog('deleteCase', {
        environment: 'PREPROD',
        id: saved.id,
        revision: 1,
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(
      await application.catalog('saveCase', { ...request, environment: 'PROD' }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(
      await application.catalog('saveCase', { ...request, evidenceDocuments: ['private'] }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
  it('rechaza escrituras obsoletas sin perder el caso ni agregar auditoría', async () => {
    const saved = value(await application.catalog('saveCase', request)).cases[0]!;
    await application.catalog('saveCase', { ...request, id: saved.id, revision: 1 });
    const before = await list();
    expect(
      await application.catalog('saveCase', { ...request, id: saved.id, revision: 1 }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      await application.catalog('deleteCase', { environment: 'QA', id: saved.id, revision: 1 }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(await list()).toEqual(before);
  });
  it('revalida ATM en la escritura y conserva el caso cuando desaparece el perfil', async () => {
    const atm = await seedAtm();
    const selected = {
      ...request,
      values: {
        ...request.values,
        draft: { ...request.values.draft, atmId: atm.id, atmRevision: atm.revision },
      },
    };
    const saved = value(await application.catalog('saveCase', selected)).cases[0]!;
    await application.catalog('saveAtm', {
      environment: 'QA',
      id: atm.id,
      revision: 1,
      values: {
        alias: atm.alias,
        entityId: atm.entityId,
        terminalId: atm.terminalId,
        acquirerId: atm.acquirerId,
        active: true,
      },
    });
    expect(await application.catalog('saveCase', selected)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(await application.reviewDraft(saved.draft)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    await application.catalog('deleteAtm', { environment: 'QA', id: atm.id, revision: 2 });
    expect((await list()).cases[0]).toEqual(saved);
    expect(
      await application.reviewDraft({ ...saved.draft, atmId: null, atmRevision: null }),
    ).toMatchObject({ ok: true, value: { status: 'BLOCKED', atm: null } });
  });
  it.each(['draft_json', 'name', 'evidence_json'] as const)(
    'no devuelve contenido sensible introducido externamente en SQLite (%s)',
    async (column) => {
      const saved = value(await application.catalog('saveCase', request)).cases[0]!;
      const database = new DatabaseSync(file);
      try {
        const content =
          column === 'draft_json'
            ? JSON.stringify({ ...request.values.draft, pin: 'private-secret' })
            : column === 'name'
              ? '0'.repeat(16)
              : JSON.stringify(['private-secret']);
        database
          .prepare(`UPDATE saved_cases SET ${column} = ? WHERE id = ?`)
          .run(content, saved.id);
      } finally {
        database.close();
      }
      const result = await application.catalog('list', { environment: 'QA' });
      expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
      expect(JSON.stringify(result)).not.toContain('private-secret');
    },
  );
  it('revierte caso y auditoría juntos ante fallo de escritura', async () => {
    await list();
    const database = new DatabaseSync(file);
    try {
      database.exec(
        "CREATE TRIGGER reject_case_audit BEFORE INSERT ON catalog_audit BEGIN SELECT RAISE(ABORT, 'private-secret'); END",
      );
    } finally {
      database.close();
    }
    const result = await application.catalog('saveCase', request);
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private-secret');
    expect((await list()).cases).toEqual([]);
    expect((await list()).audit).toEqual([]);
  });
  it('maneja servicio ausente y timeout; recargar permite verificar y recuperar', async () => {
    const absent = new DesktopApplication(preferences, identity);
    expect(await absent.catalog('saveCase', request)).toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    const hung = join(directory, 'hung-worker.cjs');
    await writeFile(
      hung,
      "const {parentPort}=require('node:worker_threads'); parentPort.on('message',()=>{});",
    );
    const slow = new WorkerCatalogStore(hung, file, 100);
    stores.push(slow);
    const timed = new DesktopApplication(preferences, identity, slow);
    expect(await timed.catalog('saveCase', request)).toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT' },
    });
    expect((await list()).cases).toEqual([]);
    expect(await application.catalog('saveCase', request)).toMatchObject({ ok: true });
  });
  it('migra una base v1 conservando perfiles, revisiones y auditoría', async () => {
    const atm = await seedAtm();
    const before = await list();
    await store.close();
    const database = new DatabaseSync(file);
    try {
      database.exec(`DROP TABLE saved_cases;
        ALTER TABLE catalog_audit RENAME TO catalog_audit_v2;
        CREATE TABLE catalog_audit (
          sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, timestamp TEXT NOT NULL,
          environment TEXT NOT NULL CHECK(environment IN ('QA','PREPROD')),
          actor TEXT NOT NULL, machine TEXT NOT NULL,
          resource TEXT NOT NULL CHECK(resource IN ('ENTITY','ATM')), record_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK(action IN ('CREATED','UPDATED','DELETED'))
        ) STRICT;
        INSERT INTO catalog_audit SELECT * FROM catalog_audit_v2;
        DROP TABLE catalog_audit_v2; PRAGMA user_version = 1;`);
    } finally {
      database.close();
    }
    const migrated = new SqliteCatalog(file);
    try {
      expect(value(migrated.execute({ kind: 'list', environment: 'QA' }, context))).toEqual(before);
    } finally {
      migrated.close();
    }
    start();
    const saved = value(
      await application.catalog('saveCase', {
        ...request,
        values: {
          ...request.values,
          draft: { ...request.values.draft, atmId: atm.id, atmRevision: atm.revision },
        },
      }),
    );
    expect(saved.atms[0]).toEqual(atm);
    expect(saved.cases).toHaveLength(1);
  });
  it('migra una base v2 con casos existentes sin asignarles expectativas', async () => {
    const saved = value(await application.catalog('saveCase', request)).cases[0]!;
    await store.close();
    const database = new DatabaseSync(file);
    try {
      database.exec(
        'ALTER TABLE saved_cases DROP COLUMN expectation_json; PRAGMA user_version = 2;',
      );
    } finally {
      database.close();
    }
    const migrated = new SqliteCatalog(file);
    try {
      const cases = value(migrated.execute({ kind: 'list', environment: 'QA' }, context)).cases;
      expect(cases).toEqual([saved]);
      expect(cases[0]?.expectation).toBeUndefined();
    } finally {
      migrated.close();
    }
  });
});
