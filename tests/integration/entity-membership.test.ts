import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteCatalog } from '../../apps/desktop/src/main/infrastructure/sqlite-catalog';
import { removeTestDirectory } from '../helpers/temporary-directory';
import type { CatalogSnapshot } from '../../packages/domain/src/catalogs';
import type { Result } from '../../packages/shared/src/contracts';

const context = { user: 'test', machine: 'test', timestamp: '2026-11-12T12:00:00.000Z' };
const base = {
  code: '205',
  name: 'Synthetic Entity',
  networkType: 'COONECTA' as const,
  active: true,
};
const value = (result: Result<CatalogSnapshot>) => {
  if (!result.ok) throw Error(result.error.code);
  return result.value;
};
describe('clasificaciones de entidad persistentes', () => {
  let directory: string, file: string, store: SqliteCatalog;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-membership-'));
    file = join(directory, 'catalog.sqlite');
    store = new SqliteCatalog(file);
  });
  afterEach(async () => {
    store.close();
    await removeTestDirectory(directory, 'coonecta-membership-');
  });
  it('guarda varias clasificaciones, no las borra desde clientes antiguos y permite borrado explícito', () => {
    const created = value(
      store.execute(
        {
          kind: 'saveEntity',
          request: {
            environment: 'QA',
            id: null,
            revision: null,
            values: { ...base, memberTypes: ['FRONT', 'EXTERNAL'] },
          },
        },
        context,
      ),
    ).entities[0]!;
    const updated = value(
      store.execute(
        {
          kind: 'saveEntity',
          request: {
            environment: 'QA',
            id: created.id,
            revision: 1,
            values: { ...base, name: 'Renamed' },
          },
        },
        context,
      ),
    ).entities[0]!;
    expect(updated.memberTypes).toEqual(['FRONT', 'EXTERNAL']);
    store.close();
    store = new SqliteCatalog(file);
    expect(
      value(store.execute({ kind: 'list', environment: 'QA' }, context)).entities[0]?.memberTypes,
    ).toEqual(['FRONT', 'EXTERNAL']);
    expect(
      store.execute(
        {
          kind: 'saveEntity',
          request: {
            environment: 'QA',
            id: created.id,
            revision: 1,
            values: { ...base, memberTypes: ['BACK'] },
          },
        },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    const cleared = value(
      store.execute(
        {
          kind: 'saveEntity',
          request: {
            environment: 'QA',
            id: created.id,
            revision: 2,
            values: { ...base, memberTypes: [] },
          },
        },
        context,
      ),
    );
    expect(cleared.entities[0]?.memberTypes).toBeUndefined();
    expect(cleared.audit).toHaveLength(3);
  });
  it('migra v3 sin alterar UUID, revisiones, ATM o auditoría', () => {
    const created = value(
      store.execute(
        {
          kind: 'saveEntity',
          request: { environment: 'QA', id: null, revision: null, values: base },
        },
        context,
      ),
    ).entities[0]!;
    const before = value(
      store.execute(
        {
          kind: 'saveAtm',
          request: {
            environment: 'QA',
            id: null,
            revision: null,
            values: {
              alias: 'Test',
              entityId: created.id,
              terminalId: 'TEST0001',
              acquirerId: '205',
              active: true,
            },
          },
        },
        context,
      ),
    );
    store.close();
    const old = new DatabaseSync(file);
    old.exec('ALTER TABLE entities DROP COLUMN member_types_json; PRAGMA user_version = 3');
    old.close();
    store = new SqliteCatalog(file);
    expect(value(store.execute({ kind: 'list', environment: 'QA' }, context))).toEqual(before);
    const current = new DatabaseSync(file, { readOnly: true });
    expect(current.prepare('PRAGMA user_version').get()?.user_version).toBe(4);
    current.close();
  });
  it('rechaza datos corruptos y timeout de escritura sin exponer valores ni auditar fallos', () => {
    const entity = value(
      store.execute(
        {
          kind: 'saveEntity',
          request: { environment: 'QA', id: null, revision: null, values: base },
        },
        context,
      ),
    ).entities[0]!;
    const lock = new DatabaseSync(file);
    try {
      lock.exec('BEGIN IMMEDIATE');
      expect(
        store.execute(
          {
            kind: 'saveEntity',
            request: {
              environment: 'QA',
              id: entity.id,
              revision: 1,
              values: { ...base, memberTypes: ['FRONT'] },
            },
          },
          context,
        ),
      ).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
      lock.exec('ROLLBACK');
      expect(value(store.execute({ kind: 'list', environment: 'QA' }, context)).audit).toHaveLength(
        1,
      );
      lock.prepare('UPDATE entities SET member_types_json = ?').run('["private-secret"]');
      const result = store.execute({ kind: 'list', environment: 'QA' }, context);
      expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
      expect(JSON.stringify(result)).not.toContain('private-secret');
    } finally {
      lock.close();
    }
  });
});
