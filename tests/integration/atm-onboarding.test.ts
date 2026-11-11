import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteCatalog } from '../../apps/desktop/src/main/infrastructure/sqlite-catalog';
import { FileQaExecutionProfiles } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { QaAtmTemplate } from '../../apps/desktop/src/main/qa-atm-template';
import type { Result } from '../../packages/shared/src/contracts';
import type { CatalogSnapshot } from '../../packages/domain/src/catalogs';
import type { CreateQaAtmRequest } from '../../packages/domain/src/atm-onboarding';
import { qaExecutionFixture } from '../helpers/qa-execution';
import { removeTestDirectory } from '../helpers/temporary-directory';

const context = { user: 'test', machine: 'test', timestamp: '2026-11-11T15:00:00.000Z' };
const value = (result: Result<CatalogSnapshot>) => {
  if (!result.ok) throw Error(result.error.message);
  return result.value;
};
describe('asistente ATM con persistencia SQLite real', () => {
  let directory: string;
  let database: SqliteCatalog;
  let request: CreateQaAtmRequest;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-atm-onboarding-'));
    database = new SqliteCatalog(join(directory, 'catalog.sqlite'));
    const entity = value(
      database.execute(
        {
          kind: 'saveEntity',
          request: {
            environment: 'QA',
            id: null,
            revision: null,
            values: { code: '205', name: 'Synthetic QA', networkType: 'COONECTA', active: true },
          },
        },
        context,
      ),
    ).entities[0]!;
    const source = value(
      database.execute(
        {
          kind: 'saveAtm',
          request: {
            environment: 'QA',
            id: null,
            revision: null,
            values: {
              alias: 'Template',
              terminalId: 'ATM20521',
              entityId: entity.id,
              acquirerId: '12345678901',
              active: true,
            },
          },
        },
        context,
      ),
    ).atms[0]!;
    request = {
      environment: 'QA',
      requestId: randomUUID(),
      templateId: source.id,
      templateRevision: source.revision,
      alias: 'Nuevo QA',
      terminalId: 'ATM20524',
    };
  });
  afterEach(async () => {
    database.close();
    await removeTestDirectory(directory, 'coonecta-atm-onboarding-');
  });
  const create = () => database.execute({ kind: 'createQaAtm', request }, context);
  it('crea, recupera después de reiniciar y audita una sola vez; hereda sin consumir reservas', async () => {
    const f = qaExecutionFixture();
    f.row.atmId = request.templateId;
    const path = join(directory, 'profiles.json');
    const original = JSON.stringify(f.input);
    await writeFile(path, original);
    const profiles = new FileQaExecutionProfiles(path);
    const reserve = vi.spyOn(profiles, 'reserve');
    const template = new QaAtmTemplate(
      profiles,
      async () => value(database.execute({ kind: 'list', environment: 'QA' }, context)),
      { read: async () => [] },
    );
    const snapshot = value(create());
    const atm = snapshot.atms.find((item) => item.id === request.requestId)!;
    expect(atm).toMatchObject({
      terminalId: request.terminalId,
      acquirerId: '12345678901',
      active: true,
      revision: 1,
    });
    expect(
      await template.inspectLocal(
        { environment: 'QA', atmId: atm.id, revision: 1 },
        f.target.endpoint,
        async () => true,
      ),
    ).toEqual({ source: 'ATM20521', sequencesRemaining: 2, securityAvailable: true });
    database.close();
    database = new SqliteCatalog(join(directory, 'catalog.sqlite'));
    const retried = value(create());
    expect(retried.atms).toHaveLength(2);
    expect(retried.audit.filter((event) => event.recordId === request.requestId)).toHaveLength(1);
    expect(await readFile(path, 'utf8')).toBe(original);
    expect(reserve).not.toHaveBeenCalled();
  });
  it('rechaza duplicados concurrentes, reutilización con otros datos y revisión obsoleta', () => {
    value(create());
    expect(
      database.execute(
        { kind: 'createQaAtm', request: { ...request, requestId: randomUUID() } },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(
      database.execute({ kind: 'createQaAtm', request: { ...request, alias: 'Otro' } }, context),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      database.execute(
        { kind: 'createQaAtm', request: { ...request, templateRevision: 2 } },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      value(database.execute({ kind: 'list', environment: 'QA' }, context)).audit.filter(
        (event) => event.recordId === request.requestId,
      ),
    ).toHaveLength(1);
  });
  it.each([
    'inactive-template',
    'inactive-entity',
    'wrong-entity',
    'wrong-template',
    'bad-acquirer',
  ])('bloquea %s sin crear ni auditar', (kind) => {
    const before = value(database.execute({ kind: 'list', environment: 'QA' }, context));
    const source = before.atms[0]!;
    const entity = before.entities[0]!;
    if (kind === 'inactive-entity' || kind === 'wrong-entity')
      value(
        database.execute(
          {
            kind: 'saveEntity',
            request: {
              environment: 'QA',
              id: entity.id,
              revision: entity.revision,
              values: {
                code: kind === 'wrong-entity' ? '206' : '205',
                name: entity.name,
                active: kind !== 'inactive-entity',
                networkType: entity.networkType,
              },
            },
          },
          context,
        ),
      );
    else {
      value(
        database.execute(
          {
            kind: 'saveAtm',
            request: {
              environment: 'QA',
              id: source.id,
              revision: source.revision,
              values: {
                alias: source.alias,
                terminalId: kind === 'wrong-template' ? 'ATM20522' : 'ATM20521',
                acquirerId: kind === 'bad-acquirer' ? 'invalid' : source.acquirerId,
                entityId: entity.id,
                active: kind !== 'inactive-template',
              },
            },
          },
          context,
        ),
      );
      request.templateRevision = 2;
    }
    expect(create()).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    const after = value(database.execute({ kind: 'list', environment: 'QA' }, context));
    expect(after.atms).toHaveLength(1);
    expect(after.audit.some((event) => event.recordId === request.requestId)).toBe(false);
  });
});
