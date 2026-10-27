import { randomUUID } from 'node:crypto';
import { mkdtemp, open, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { SqliteCatalog } from '../../apps/desktop/src/main/infrastructure/sqlite-catalog';
import {
  FileQaExecutionProfiles,
  qaExecutionProfileIdentity,
} from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { FileQaWithdrawalPolicies } from '../../apps/desktop/src/main/infrastructure/qa-withdrawal-policies';
import {
  QaAtmTemplate,
  QaTemplateContextProvider,
} from '../../apps/desktop/src/main/qa-atm-template';
import type { CatalogSnapshot } from '../../packages/domain/src/catalogs';
import type { Result } from '../../packages/shared/src/contracts';
import { qaExecutionFixture, qaWithdrawalPolicy } from '../helpers/qa-execution';
import { removeTestDirectory } from '../helpers/temporary-directory';

it('crear en SQLite habilita la plantilla sin reiniciar; el pool persiste, no se copia y se agota sin reciclarse', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coonecta-qa-template-'));
  const context = { user: 'test', machine: 'test', timestamp: '2026-10-27T12:00:00.000Z' };
  const database = new SqliteCatalog(join(directory, 'catalog.sqlite'));
  const value = (result: Result<CatalogSnapshot>) => {
    if (!result.ok) throw Error(result.error.code);
    return result.value;
  };
  try {
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
    const create = (terminalId: string) =>
      value(
        database.execute(
          {
            kind: 'saveAtm',
            request: {
              environment: 'QA',
              id: null,
              revision: null,
              values: {
                alias: terminalId,
                terminalId,
                acquirerId: '12345678901',
                active: true,
                entityId: entity.id,
              },
            },
          },
          context,
        ),
      ).atms.find((atm) => atm.terminalId === terminalId)!;
    const sourceAtm = create('ATM20521');
    const fixture = qaExecutionFixture();
    fixture.row.atmId = fixture.target.draft.atmId = sourceAtm.id;
    fixture.row.reservedSequences.push(650103);
    const path = join(directory, 'profiles.json');
    const policyPath = join(directory, 'policies.json');
    await writeFile(path, JSON.stringify(fixture.input));
    const profiles = new FileQaExecutionProfiles(path);
    const original = (await profiles.read()).profiles[0]!;
    await writeFile(
      policyPath,
      JSON.stringify({ version: 1, policies: [qaWithdrawalPolicy(original)] }),
    );
    const catalog = async () =>
      value(database.execute({ kind: 'list', environment: 'QA' }, context));
    const policies = new FileQaWithdrawalPolicies(policyPath);
    const template = new QaAtmTemplate(profiles, catalog, policies);
    // Save AFTER the live template service has been created, exactly as the UI does.
    const secondAtm = create('ATM20524');
    const second = {
      ...fixture.target,
      terminalId: secondAtm.terminalId,
      draft: { ...fixture.target.draft, atmId: secondAtm.id, atmRevision: secondAtm.revision },
    };
    const bound = await template.resolve(second);
    expect(bound.profile.terminalId).toBe('ATM20524');
    expect(bound.profile.keyReference).toBe(original.keyReference);
    expect((await bound.policies.read())[0]!.allowedAmounts).toEqual(['20.00', '40.00']);
    const reserve = (resolved: Awaited<ReturnType<QaAtmTemplate['resolve']>>) =>
      resolved.profiles.reserve(
        resolved.profile.id,
        new AbortController().signal,
        qaExecutionProfileIdentity(resolved.profile),
      );
    const lock = await open(path + '.lock', 'wx');
    try {
      await expect(reserve(bound)).rejects.toThrow();
    } finally {
      await lock.close();
      await unlink(path + '.lock');
    }
    expect(await reserve(bound)).toBe(650101);
    expect(await reserve(await template.resolve(fixture.target))).toBe(650102);
    // A newly constructed Main service reuses the remaining pool after restart.
    const restarted = new QaAtmTemplate(new FileQaExecutionProfiles(path), catalog, policies);
    const thirdAtm = create('ATM20525');
    const third = {
      ...second,
      draft: { ...second.draft, atmId: thirdAtm.id },
      terminalId: thirdAtm.terminalId,
    };
    expect(await reserve(await restarted.resolve(third))).toBe(650103);
    await expect(reserve(await restarted.resolve(second))).rejects.toThrow(
      'QA_SEQUENCE_UNAVAILABLE',
    );
    const stored = await profiles.read();
    expect(stored.profiles).toHaveLength(1);
    expect(stored.file.profiles[0]!.reservedSequences).toEqual([]);
    expect(qaExecutionProfileIdentity(stored.profiles[0]!)).toBe(
      qaExecutionProfileIdentity(original),
    );
    const provider = new QaTemplateContextProvider(
      restarted,
      'BALANCE',
      {
        current: async () => null,
        withTransaction: vi.fn(),
      },
      { request: vi.fn() },
      { available: async () => true, encrypt: vi.fn() },
    );
    expect(
      (await provider.inspect({ ...third, cardReadId: randomUUID() })).blockers.map(
        (item) => item.id,
      ),
    ).toContain('QA-SEQUENCE-POOL');
  } finally {
    database.close();
    await removeTestDirectory(directory, 'coonecta-qa-template-');
  }
});
