import { describe, expect, it } from 'vitest';
import {
  documentedCmsAtmContextBinding,
  parseQaCmsAtmEvidence,
} from '../../apps/desktop/src/main/infrastructure/qa-cms-atm-evidence';
import { QaBalanceContextRouter } from '../../apps/desktop/src/main/qa-balance-context-router';
import { cmsEvidenceFixture } from '../helpers/qa-cms-atm-evidence';

describe('llave maestra CMS y emisor directo a SmartVista', () => {
  it('reconoce la comprobación sin usar una llave maestra como PIN key ni habilitar envío', async () => {
    const { row, target } = cmsEvidenceFixture();
    const router = new QaBalanceContextRouter();
    router.bind(documentedCmsAtmContextBinding(row));
    const result = await router.inspect(target);
    expect(result.ready).toBe(false);
    expect(result.blockers.map((item) => item.id)).toEqual([
      'QA-DIRECT-PIN-KEY-BINDING',
      'QA-EXECUTION-PROFILE-BINDING',
    ]);
    expect(result.blockers[0]!.label).toContain('Maestra CMS verificada');
    expect(JSON.stringify(result)).not.toMatch(/TCS|:6100|30964|192\.0\.2/);
    await expect(router.acquire(target, new AbortController().signal)).rejects.toThrow(
      'QA_DIRECT_PIN_CONTEXT_NOT_BOUND',
    );
    expect(JSON.stringify(result)).not.toMatch(/componentIds|keyCheckValue|KCV/);
  });
  it('no habilita ejecución al corregir la IP ni al cambiar indicadores del snapshot', async () => {
    const { row, target } = cmsEvidenceFixture();
    row.hostKeyChangePending = false;
    row.masterCheckMatched = false;
    const binding = documentedCmsAtmContextBinding(row);
    row.masterCheckMatched = true; // Caller mutations cannot change the evidence used by Main.
    const result = await binding.provider.inspect(target);
    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(2);
    expect(result.blockers[0]!.label).toContain('sin verificar');
    await expect(binding.provider.acquire(target, new AbortController().signal)).rejects.toThrow(
      'QA_DIRECT_PIN_CONTEXT_NOT_BOUND',
    );
  });
  it('conserva aislamiento de perfil y destino; el origen TCS no condiciona ISO directo', async () => {
    const { row, target } = cmsEvidenceFixture();
    const router = new QaBalanceContextRouter();
    router.bind(documentedCmsAtmContextBinding(row));
    const result = await router.inspect(target);
    expect(result.blockers.some((item) => item.id === 'QA-CMS-SOURCE-ADDRESS')).toBe(false);
    for (const changed of [
      { ...target, terminalId: 'ATM20524' },
      { ...target, endpoint: row.tcsEndpoint },
      { ...target, draft: { ...target.draft, atmRevision: 100 } },
    ]) {
      expect((await router.inspect(changed)).blockers[0]!.id).toBe('QA-ATM-PROVIDER-NOT-BOUND');
    }
  });
  it.each([false, true])(
    'conserva la custodia maestra sin activar PIN por metadata: %s',
    async (networkCheckMatched) => {
      const { row, target } = cmsEvidenceFixture();
      row.masterKeyCustody = {
        keyReference: row.id,
        networkCheckMatched,
        protectedAt: row.verifiedAt,
      };
      const provider = documentedCmsAtmContextBinding(row).provider;
      const result = await provider.inspect(target);
      expect(result.ready).toBe(false);
      expect(result.blockers[0]!.label).toContain('protección de Windows');
      expect(result.blockers[0]!.label.includes('No coincide')).toBe(!networkCheckMatched);
      expect(result.blockers.every((blocker) => blocker.label.length <= 200)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(row.id);
      await expect(provider.acquire(target, new AbortController().signal)).rejects.toThrow(
        'QA_DIRECT_PIN_CONTEXT_NOT_BOUND',
      );
    },
  );
  it.each([
    { environment: 'PROD' },
    { entityCode: '206' },
    { atmRevision: 0 },
    { componentIds: [101, 101] },
    { componentIds: [101] },
    { imageId: -1 },
    { masterCheckMatched: 'true' },
    { verifiedAt: 'yesterday' },
    { tcsEndpoint: { host: 'https://example.com', port: 6100 } },
    { sourceEndpoint: { host: '127.0.0.1', port: 0 } },
    { key: 'UNSUPPORTED_PRIVATE_FIELD' },
    { pinBlock: 'UNSUPPORTED_PRIVATE_FIELD' },
    {
      masterKeyCustody: {
        keyReference: 'invalid',
        networkCheckMatched: false,
        protectedAt: 'invalid',
      },
    },
    { masterKeyCustody: null },
    { masterKeyCustody: { key: 'UNSUPPORTED_PRIVATE_FIELD' } },
  ])('rechaza campos no aprobados o secretos: %j', (patch) => {
    const { row } = cmsEvidenceFixture();
    expect(() => parseQaCmsAtmEvidence({ version: 1, bindings: [{ ...row, ...patch }] })).toThrow(
      'QA_CMS_ATM_EVIDENCE_INVALID',
    );
  });
  it('rechaza duplicados y límites de documento', () => {
    const { row } = cmsEvidenceFixture();
    for (const input of [
      { version: 1, bindings: [row, row] },
      { version: 2, bindings: [row] },
      { version: 1, bindings: Array(51).fill(row) },
      { version: 1, bindings: [], secret: true },
    ])
      expect(() => parseQaCmsAtmEvidence(input)).toThrow('QA_CMS_ATM_EVIDENCE_INVALID');
  });
});
