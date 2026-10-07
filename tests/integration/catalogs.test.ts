import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { SqliteCatalog } from '../../apps/desktop/src/main/infrastructure/sqlite-catalog';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import type { CatalogSnapshot } from '../../packages/domain/src/catalogs';
import type { Result } from '../../packages/shared/src/contracts';
import type { CatalogCommand } from '../../packages/shared/src/catalog-worker';
import { removeTestDirectory } from '../helpers/temporary-directory';

const context = {
  user: 'test-user',
  machine: 'test-machine',
  timestamp: '2026-10-06T12:00:00.000Z',
};
const entityValues = {
  code: 'TEST',
  name: 'Synthetic Test Entity',
  networkType: 'COONECTA' as const,
  active: true,
};
function value(result: Result<CatalogSnapshot>): CatalogSnapshot {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe('catálogos SQLite reales', () => {
  let directory: string;
  let file: string;
  let store: SqliteCatalog;
  const execute = (command: CatalogCommand) => store.execute(command, context);
  const createEntity = () =>
    value(
      execute({
        kind: 'saveEntity',
        request: { environment: 'QA', id: null, revision: null, values: entityValues },
      }),
    ).entities[0]!;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-catalog-'));
    file = join(directory, 'catalogs.sqlite');
    store = new SqliteCatalog(file);
  });
  afterEach(async () => {
    store.close();
    await removeTestDirectory(directory, 'coonecta-catalog-');
  });

  it('crea, edita, persiste y elimina entidades, con UUID/UTC y auditoría', () => {
    expect(value(execute({ kind: 'list', environment: 'QA' })).entities).toEqual([]);
    const entity = createEntity();
    expect(entity.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entity).toMatchObject({
      ...entityValues,
      revision: 1,
      status: 'DRAFT',
      createdAt: context.timestamp,
    });
    const updated = value(
      execute({
        kind: 'saveEntity',
        request: {
          environment: 'QA',
          id: entity.id,
          revision: 1,
          values: { ...entityValues, name: 'Edited Entity', active: false },
        },
      }),
    );
    expect(updated.entities[0]).toMatchObject({
      revision: 2,
      name: 'Edited Entity',
      active: false,
    });
    store.close();
    store = new SqliteCatalog(file);
    expect(value(execute({ kind: 'list', environment: 'PREPROD' })).entities[0]?.name).toBe(
      'Edited Entity',
    );
    const deleted = value(
      execute({ kind: 'deleteEntity', request: { environment: 'QA', id: entity.id, revision: 2 } }),
    );
    expect(deleted.entities).toEqual([]);
    expect(deleted.audit.map((event) => event.action)).toEqual(['DELETED', 'UPDATED', 'CREATED']);
    expect(deleted.audit[0]).toMatchObject({
      user: context.user,
      machine: context.machine,
      timestamp: context.timestamp,
    });
  });
  it('separa QA/PREPROD y permite el mismo Terminal ID en ambientes distintos', () => {
    const entity = createEntity();
    const values = {
      alias: 'Test ATM',
      entityId: entity.id,
      terminalId: 'Test-Terminal',
      acquirerId: 'Test-Acquirer',
      active: true,
    };
    const qa = value(
      execute({
        kind: 'saveAtm',
        request: { environment: 'QA', id: null, revision: null, values },
      }),
    ).atms[0]!;
    const preprod = value(
      execute({
        kind: 'saveAtm',
        request: { environment: 'PREPROD', id: null, revision: null, values },
      }),
    ).atms[0]!;
    expect(qa.id).not.toBe(preprod.id);
    expect(value(execute({ kind: 'list', environment: 'QA' })).atms.map((atm) => atm.id)).toEqual([
      qa.id,
    ]);
    expect(
      execute({
        kind: 'saveAtm',
        request: { environment: 'QA', id: null, revision: null, values },
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(
      execute({ kind: 'deleteAtm', request: { environment: 'PREPROD', id: qa.id, revision: 1 } }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    const changed = value(
      execute({
        kind: 'saveAtm',
        request: {
          environment: 'QA',
          id: qa.id,
          revision: 1,
          values: { ...values, active: false },
        },
      }),
    );
    expect(changed.atms[0]).toMatchObject({ active: false, revision: 2 });
    expect(
      value(execute({ kind: 'deleteAtm', request: { environment: 'QA', id: qa.id, revision: 2 } }))
        .atms,
    ).toEqual([]);
  });
  it('protege referencias a entidades y evita activación con entidad inactiva', () => {
    const entity = createEntity();
    const values = {
      alias: 'Test ATM',
      entityId: entity.id,
      terminalId: 'Test-Terminal',
      acquirerId: 'Test-Acquirer',
      active: true,
    };
    const atm = value(
      execute({
        kind: 'saveAtm',
        request: { environment: 'PREPROD', id: null, revision: null, values },
      }),
    ).atms[0]!;
    expect(
      execute({ kind: 'deleteEntity', request: { environment: 'QA', id: entity.id, revision: 1 } }),
    ).toMatchObject({ ok: false, error: { code: 'IN_USE' } });
    value(
      execute({
        kind: 'saveEntity',
        request: {
          environment: 'QA',
          id: entity.id,
          revision: 1,
          values: { ...entityValues, active: false },
        },
      }),
    );
    expect(
      execute({
        kind: 'saveAtm',
        request: { environment: 'PREPROD', id: atm.id, revision: 1, values },
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    value(
      execute({ kind: 'deleteAtm', request: { environment: 'PREPROD', id: atm.id, revision: 1 } }),
    );
    expect(
      value(
        execute({
          kind: 'deleteEntity',
          request: { environment: 'QA', id: entity.id, revision: 2 },
        }),
      ).entities,
    ).toEqual([]);
    expect(
      execute({
        kind: 'saveAtm',
        request: { environment: 'QA', id: null, revision: null, values },
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
  it('rechaza código duplicado y versiones obsoletas sin añadir auditoría', () => {
    const entity = createEntity();
    expect(
      execute({
        kind: 'saveEntity',
        request: { environment: 'QA', id: null, revision: null, values: entityValues },
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    value(
      execute({
        kind: 'saveEntity',
        request: {
          environment: 'QA',
          id: entity.id,
          revision: 1,
          values: { ...entityValues, name: 'Changed' },
        },
      }),
    );
    expect(
      execute({
        kind: 'saveEntity',
        request: { environment: 'QA', id: entity.id, revision: 1, values: entityValues },
      }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      execute({ kind: 'deleteEntity', request: { environment: 'QA', id: entity.id, revision: 1 } }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(value(execute({ kind: 'list', environment: 'QA' })).audit).toHaveLength(2);
  });
  it('parametriza SQL y rechaza datos sensibles antes de almacenarlos', () => {
    const name = "Example'); DROP TABLE entities; --";
    expect(
      value(
        execute({
          kind: 'saveEntity',
          request: {
            environment: 'QA',
            id: null,
            revision: null,
            values: { ...entityValues, name },
          },
        }),
      ).entities[0]?.name,
    ).toBe(name);
    const invalid = execute({
      kind: 'saveEntity',
      request: {
        environment: 'QA',
        id: null,
        revision: null,
        values: { ...entityValues, code: '0'.repeat(16) },
      },
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(JSON.stringify(invalid)).not.toContain('0'.repeat(16));
    expect(value(execute({ kind: 'list', environment: 'QA' })).entities).toHaveLength(1);
  });
  it('revierte la mutación cuando falla la inserción de auditoría', () => {
    const connection = new DatabaseSync(file);
    try {
      connection.exec(
        "CREATE TRIGGER reject_audit BEFORE INSERT ON catalog_audit BEGIN SELECT RAISE(ABORT, 'private-secret'); END",
      );
    } finally {
      connection.close();
    }
    const result = execute({
      kind: 'saveEntity',
      request: { environment: 'QA', id: null, revision: null, values: entityValues },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private-secret');
    expect(value(execute({ kind: 'list', environment: 'QA' })).entities).toEqual([]);
  });
  it.each(['', ' ', '-', '\u00a0'])(
    'bloquea contenido sensible introducido externamente en una base persistida (separador %j)',
    (separator) => {
      const entity = createEntity();
      const sensitive = Array(4).fill('0'.repeat(4)).join(separator);
      const connection = new DatabaseSync(file);
      try {
        connection.prepare('UPDATE entities SET name = ? WHERE id = ?').run(sensitive, entity.id);
      } finally {
        connection.close();
      }
      const result = execute({ kind: 'list', environment: 'QA' });
      expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
      expect(JSON.stringify(result)).not.toContain(sensitive);
    },
  );
  it('rechaza schemas futuros sin recrear la base', () => {
    const connection = new DatabaseSync(file);
    try {
      connection.exec('PRAGMA user_version = 99');
    } finally {
      connection.close();
    }
    expect(() => new SqliteCatalog(file)).toThrow('STORAGE_UNAVAILABLE');
    const check = new DatabaseSync(file);
    try {
      expect(check.prepare('PRAGMA user_version').get()?.user_version).toBe(99);
    } finally {
      check.close();
    }
  });
  it('devuelve timeout de bloqueo SQLite y permite reintentar después de liberar', () => {
    const lock = new DatabaseSync(file);
    try {
      lock.exec('BEGIN IMMEDIATE');
      expect(
        execute({
          kind: 'saveEntity',
          request: { environment: 'QA', id: null, revision: null, values: entityValues },
        }),
      ).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
      lock.exec('ROLLBACK');
      expect(createEntity().name).toBe(entityValues.name);
    } finally {
      lock.close();
    }
  });
  it('Main valida payload y ambiente antes de llamar al adaptador', async () => {
    const application = new DesktopApplication(
      {
        read: async () => ({ version: 1, environment: 'QA', audit: [] }),
        write: async () => undefined,
      },
      {
        agentId: 'test-agent',
        version: '0.1.0',
        hostname: context.machine,
        user: context.user,
        uuid: () => 'unused',
        now: () => context.timestamp,
      },
      {
        execute: async (command, actor) => store.execute(command, actor),
        close: async () => undefined,
      },
    );
    expect(await application.catalog('list', { environment: 'PROD' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(
      await application.catalog('saveEntity', {
        environment: 'PREPROD',
        id: null,
        revision: null,
        values: entityValues,
      }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      await application.catalog('saveEntity', {
        environment: 'QA',
        id: null,
        revision: null,
        values: entityValues,
        secret: 'private-secret',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(
      await application.catalog('saveEntity', {
        environment: 'QA',
        id: null,
        revision: null,
        values: entityValues,
      }),
    ).toMatchObject({ ok: true, value: { entities: [{ name: entityValues.name }] } });
  });
  it('conserva una base corrupta y no filtra su contenido', async () => {
    const corrupt = join(directory, 'corrupt.sqlite');
    await writeFile(corrupt, 'private-secret');
    expect(() => new SqliteCatalog(corrupt)).toThrow();
  });
});
