import { describe, expect, it, vi } from 'vitest';
import { SharedQaPinKey } from '../../apps/desktop/src/main/shared-qa-pin-key';
import {
  documentedCmsAtmContextBinding,
  parseQaCmsAtmEvidence,
} from '../../apps/desktop/src/main/infrastructure/qa-cms-atm-evidence';
import { qaExecutionFixture } from '../helpers/qa-execution';
import { cmsEvidenceFixture } from '../helpers/qa-cms-atm-evidence';

function fixture() {
  const { profile, input } = qaExecutionFixture();
  const { row, target } = cmsEvidenceFixture();
  row.terminalId = target.terminalId = 'ATM20524';
  row.directPinKey = {
    sourceProfileId: profile.id,
    keyReference: profile.keyReference,
    approvalSource: 'USER_QA_INSTRUCTION',
    approvedAt: row.verifiedAt,
  };
  const profiles = {
    read: vi.fn(async () => ({ file: { ...input, version: 1 as const }, profiles: [profile] })),
  };
  const cipher = { available: vi.fn(async () => true) };
  const shared = new SharedQaPinKey(profiles, cipher);
  return { row, target, profile, profiles, cipher, shared };
}

describe('clave QA compartida por referencia del enlace', () => {
  it('resuelve la referencia existente sin exigir otra clave ni habilitar un perfil ISO ausente', async () => {
    const f = fixture();
    const provider = documentedCmsAtmContextBinding(f.row, f.shared).provider;
    const readiness = await provider.inspect(f.target);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map((b) => b.id)).toEqual(['QA-EXECUTION-PROFILE-BINDING']);
    expect(readiness.blockers[0]!.label).toContain('compartida disponible');
    expect(f.cipher.available).toHaveBeenCalledWith(f.profile.keyReference);
    expect(JSON.stringify(readiness)).not.toContain(f.profile.keyReference);
    expect(JSON.stringify(readiness)).not.toContain(f.profile.id);
    await expect(provider.acquire(f.target, new AbortController().signal)).rejects.toThrow(
      'QA_DIRECT_PIN_CONTEXT_NOT_BOUND',
    );
  });
  it.each(['host', 'port', 'reference', 'source', 'environment'] as const)(
    'rechaza un vínculo incompatible (%s) antes de acceder a la credencial',
    async (change) => {
      const f = fixture();
      if (change === 'host') f.row.senderEndpoint.host = '192.0.2.1';
      if (change === 'port') f.row.senderEndpoint.port++;
      if (change === 'reference') f.row.directPinKey!.keyReference = f.row.id;
      if (change === 'source') f.row.directPinKey!.sourceProfileId = f.row.id;
      if (change === 'environment') Object.assign(f.row, { environment: 'PROD' });
      expect(await f.shared.available(f.row)).toBe(false);
      expect(f.cipher.available).not.toHaveBeenCalled();
    },
  );
  it('revalida la referencia al cambiar o retirar el perfil origen', async () => {
    const f = fixture();
    expect(await f.shared.available(f.row)).toBe(true);
    f.profile.keyReference = f.row.id;
    expect(await f.shared.available(f.row)).toBe(false);
    f.profiles.read.mockResolvedValue({ file: { version: 1, profiles: [] }, profiles: [] });
    expect(await f.shared.available(f.row)).toBe(false);
    expect(f.cipher.available).toHaveBeenCalledTimes(1);
  });
  it.each(['missing', 'timeout', 'store'] as const)(
    'conserva el bloqueo si la dependencia falla: %s',
    async (cause) => {
      const f = fixture();
      if (cause === 'missing') f.cipher.available.mockResolvedValue(false);
      if (cause === 'timeout')
        f.cipher.available.mockRejectedValue(Error('PRIVATE_TIMEOUT_DETAIL'));
      if (cause === 'store') f.profiles.read.mockRejectedValue(Error('PRIVATE_STORE_DETAIL'));
      const result = await documentedCmsAtmContextBinding(f.row, f.shared).provider.inspect(
        f.target,
      );
      expect(result.blockers[0]!.id).toBe('QA-DIRECT-PIN-KEY-BINDING');
      expect(JSON.stringify(result)).not.toMatch(/PRIVATE|keyReference|sourceProfileId/);
    },
  );
  it('no confunde la maestra CMS ni la mera declaración con una clave disponible', async () => {
    const f = fixture();
    expect(
      (await documentedCmsAtmContextBinding(f.row).provider.inspect(f.target)).blockers,
    ).toHaveLength(2);
    delete f.row.directPinKey;
    f.row.masterKeyCustody = {
      keyReference: f.profile.keyReference,
      networkCheckMatched: true,
      protectedAt: f.row.verifiedAt,
    };
    expect(await f.shared.available(f.row)).toBe(false);
    expect(f.cipher.available).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { approvalSource: 'AUTOMATIC' },
    { approvedAt: 'yesterday' },
    { keyReference: 'invalid' },
    { sourceProfileId: 'invalid' },
    { secret: 'UNSUPPORTED_PRIVATE_FIELD' },
  ])('valida el vínculo privado y rechaza secretos o metadatos incompletos: %j', (patch) => {
    const f = fixture();
    const directPinKey = patch === null ? null : { ...f.row.directPinKey, ...patch };
    if (patch && Object.keys(patch).length === 0)
      delete (directPinKey as Record<string, unknown>).keyReference;
    expect(() =>
      parseQaCmsAtmEvidence({ version: 1, bindings: [{ ...f.row, directPinKey }] }),
    ).toThrow('QA_CMS_ATM_EVIDENCE_INVALID');
  });
});
