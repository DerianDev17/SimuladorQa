import { describe, expect, it, vi } from 'vitest';
import {
  QaAtmTemplate,
  QaTemplateContextProvider,
} from '../../apps/desktop/src/main/qa-atm-template';
import {
  parseQaExecutionProfileFile,
  qaExecutionProfileIdentity,
} from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { qaWithdrawalProfileFingerprint } from '../../apps/desktop/src/main/infrastructure/qa-withdrawal-policies';
import { qaExecutionFixture, qaWithdrawalPolicy, qaNow } from '../helpers/qa-execution';
import { templateCatalog, templateAtm } from '../helpers/qa-template';

function setup() {
  const source = qaExecutionFixture();
  const other = qaExecutionFixture().target;
  other.terminalId = 'ATM20524';
  const catalog = templateCatalog(source.target);
  catalog.atms.push(templateAtm(other, catalog.entities[0]!.id));
  const policies = [qaWithdrawalPolicy(source.profile)];
  const store = {
    read: vi.fn(async () => parseQaExecutionProfileFile(source.input)),
    reserve: vi.fn(async () => source.row.reservedSequences.shift()!),
  };
  const readCatalog = vi.fn(async () => structuredClone(catalog));
  const template = new QaAtmTemplate(store, readCatalog, { read: async () => policies });
  return { source, other, catalog, policies, store, template, readCatalog };
}

describe('plantilla reutilizable ATM20521', () => {
  it('resuelve ATM creado después del arranque sin perfil/fecha/pool propio y conserva el origen', async () => {
    const f = setup();
    const original = JSON.stringify(f.source.input);
    const created = qaExecutionFixture().target;
    created.terminalId = 'ATM20525';
    f.catalog.atms.push(templateAtm(created, f.catalog.entities[0]!.id));
    const bound = await f.template.resolve(created);
    expect(bound.profile).toMatchObject({
      id: created.draft.atmId,
      atmId: created.draft.atmId,
      terminalId: 'ATM20525',
      keyReference: f.source.profile.keyReference,
      accountingDate: f.source.profile.accountingDate,
      applicationId: f.source.profile.applicationId,
    });
    expect(bound.profile.fixedFields.get(32)).toEqual(Buffer.from('0B012345678901', 'hex'));
    expect((await bound.profiles.read()).file.profiles[0]!.reservedSequences).toEqual([
      650101, 650102,
    ]);
    expect(JSON.stringify(f.source.input)).toBe(original);
    expect(f.source.input.profiles).toHaveLength(1);
    expect(f.store.reserve).not.toHaveBeenCalled();
  });
  it('consume un único pool de la estación para ambos terminales sin duplicarlo', async () => {
    const f = setup();
    for (const [index, target] of [f.source.target, f.other].entries()) {
      const bound = await f.template.resolve(target);
      expect(
        await bound.profiles.reserve(
          bound.profile.id,
          new AbortController().signal,
          qaExecutionProfileIdentity(bound.profile),
        ),
      ).toBe(650101 + index);
      expect(f.store.reserve).toHaveBeenLastCalledWith(
        f.source.profile.id,
        expect.any(AbortSignal),
        qaExecutionProfileIdentity(f.source.profile),
      );
    }
    expect(f.source.row.reservedSequences).toEqual([]);
  });
  it('hereda retiro manteniendo montos, seguridad y revocación de su contrato', async () => {
    const f = setup();
    const bound = await f.template.resolve(f.other);
    const policy = (await bound.policies.read())[0]!;
    expect(policy.profileId).toBe(bound.profile.id);
    expect(policy.profileFingerprint).toBe(qaWithdrawalProfileFingerprint(bound.profile));
    expect(policy.allowedAmounts).toEqual(f.policies[0]!.allowedAmounts);
    f.policies[0]!.profileFingerprint = '0'.repeat(64);
    await expect(bound.policies.read()).rejects.toThrow('QA_WITHDRAWAL_POLICY_CHANGED');
    f.policies.length = 0;
    expect(await bound.policies.read()).toEqual([]);
  });
  it.each([
    'inactive',
    'entity',
    'revision',
    'terminal',
    'acquirer',
    'endpoint',
    'environment',
    'source',
    'sourceInactive',
  ] as const)('rechaza contexto incompatible: %s', async (change) => {
    const f = setup();
    if (change === 'inactive') f.catalog.atms[1]!.active = false;
    if (change === 'entity') f.catalog.entities[0]!.code = '999';
    if (change === 'revision') f.other.draft.atmRevision = 2;
    if (change === 'terminal') f.other.terminalId = 'OTHER123';
    if (change === 'acquirer') f.catalog.atms[1]!.acquirerId = 'invalid';
    if (change === 'endpoint') f.other.endpoint.port++;
    if (change === 'environment') f.other.draft.environment = 'PREPROD';
    if (change === 'source') f.source.input.profiles.length = 0;
    if (change === 'sourceInactive') f.catalog.atms[0]!.active = false;
    await expect(f.template.resolve(f.other)).rejects.toThrow(/QA_TEMPLATE_/);
    expect(f.store.reserve).not.toHaveBeenCalled();
  });
  it.each(['key', 'catalog', 'sourceRevision', 'remove', 'specificProfile'] as const)(
    'revalida cambios entre resolver y enviar: %s',
    async (change) => {
      const f = setup();
      const bound = await f.template.resolve(f.other);
      if (change === 'key') f.source.row.keyReference = f.source.row.id;
      if (change === 'catalog') f.catalog.atms[1]!.acquirerId = '123';
      if (change === 'sourceRevision') f.catalog.atms[0]!.revision++;
      if (change === 'remove') f.source.input.profiles.length = 0;
      if (change === 'specificProfile') {
        const other = qaExecutionFixture().row;
        other.atmId = f.other.draft.atmId!;
        other.terminalId = f.other.terminalId;
        other.reservedSequences = [700001];
        f.source.input.profiles.push(other);
      }
      await expect(bound.validate()).rejects.toThrow();
      await expect(
        bound.profiles.reserve(
          bound.profile.id,
          new AbortController().signal,
          qaExecutionProfileIdentity(bound.profile),
        ),
      ).rejects.toThrow();
      expect(f.store.reserve).not.toHaveBeenCalled();
    },
  );
  it('admite nuevas revisiones administrativas en la siguiente operación', async () => {
    const f = setup();
    f.catalog.atms[1]!.revision = f.other.draft.atmRevision = 2;
    expect((await f.template.resolve(f.other)).profile.atmRevision).toBe(2);
  });
  it('no reserva si se cancela o no coincide la identidad esperada', async () => {
    const f = setup();
    const bound = await f.template.resolve(f.other);
    const abort = new AbortController();
    abort.abort();
    await expect(
      bound.profiles.reserve(
        bound.profile.id,
        abort.signal,
        qaExecutionProfileIdentity(bound.profile),
      ),
    ).rejects.toThrow();
    await expect(
      bound.profiles.reserve(bound.profile.id, new AbortController().signal, 'changed'),
    ).rejects.toThrow();
    expect(f.store.reserve).not.toHaveBeenCalled();
  });
  it.each(['catalogTimeout', 'profileUnavailable', 'cipherUnavailable'] as const)(
    'diagnostica dependencias sin secretos ni pedir PIN: %s',
    async (cause) => {
      const f = setup();
      if (cause === 'catalogTimeout') f.readCatalog.mockRejectedValue(Error('PRIVATE_TIMEOUT'));
      if (cause === 'profileUnavailable') f.store.read.mockRejectedValue(Error('PRIVATE_PATH'));
      const pin = { request: vi.fn() };
      const provider = new QaTemplateContextProvider(
        f.template,
        'BALANCE',
        {
          current: async () => null,
          withTransaction: vi.fn(),
        },
        pin,
        { available: async () => false, encrypt: vi.fn() },
        () => qaNow,
      );
      const result = await provider.inspect(f.other);
      expect(result.ready).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/PRIVATE|keyReference/);
      expect(pin.request).not.toHaveBeenCalled();
      expect(f.store.reserve).not.toHaveBeenCalled();
    },
  );
});
