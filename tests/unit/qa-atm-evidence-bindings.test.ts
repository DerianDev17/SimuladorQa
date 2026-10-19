import { describe, expect, it } from 'vitest';
import {
  parseQaAtmEvidenceBindings,
  documentedQaAtmContextBinding,
} from '../../apps/desktop/src/main/infrastructure/qa-atm-evidence-bindings';
import { QaBalanceContextRouter } from '../../apps/desktop/src/main/qa-balance-context-router';
import { evidenceFixture } from '../helpers/qa-atm-evidence';

describe('vinculación documental de ATM QA', () => {
  it('vincula el cajero y muestra dependencias concretas sin habilitar ejecución', async () => {
    const { target, input } = evidenceFixture();
    const router = new QaBalanceContextRouter();
    router.bind(documentedQaAtmContextBinding(parseQaAtmEvidenceBindings(input)[0]!));
    const readiness = await router.inspect(target);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map((row) => row.id)).toEqual([
      'QA-PIN-HSM-BINDING',
      'QA-PIN-FORMAT-MAPPING',
      'QA-SEQUENCE-CALENDAR-BINDING',
    ]);
    expect(readiness.blockers[0]!.label).toContain('80131 → CB 82052');
    await expect(router.acquire(target, new AbortController().signal)).rejects.toThrow(
      'QA_DOCUMENTED_CONTEXT_NOT_EXECUTABLE',
    );
  });
  it.each(['PROD', 'revision', 'endpoint', 'secret', 'duplicate', 'kcv', 'source'])(
    'rechaza evidencia inválida: %s',
    (change) => {
      const { row, input } = evidenceFixture();
      if (change === 'PROD') row.environment = 'PROD';
      if (change === 'revision') row.atmRevision = 0;
      if (change === 'endpoint') row.endpoint.host = 'not-a-host';
      if (change === 'secret') Object.assign(row, { key: 'UNSUPPORTED-SECRET-FIELD' });
      if (change === 'duplicate') input.bindings.push(structuredClone(row));
      if (change === 'kcv') row.keyCheckValue = 'invalid';
      if (change === 'source') row.sourceReference = 'unrestricted<script>';
      expect(() => parseQaAtmEvidenceBindings(input)).toThrow('QA_ATM_EVIDENCE_INVALID');
    },
  );
  it('no utiliza la evidencia de otro cajero, revisión o destino', async () => {
    const { target, input } = evidenceFixture();
    const router = new QaBalanceContextRouter();
    router.bind(documentedQaAtmContextBinding(parseQaAtmEvidenceBindings(input)[0]!));
    for (const changed of [
      { ...target, terminalId: 'ATM20522' },
      { ...target, draft: { ...target.draft, atmRevision: 2 } },
      { ...target, endpoint: { ...target.endpoint, port: 1234 } },
    ]) {
      expect((await router.inspect(changed)).blockers[0]!.id).toBe('QA-ATM-PROVIDER-NOT-BOUND');
      await expect(router.acquire(changed, new AbortController().signal)).rejects.toThrow();
    }
  });
  it('mantiene el KCV privado y no lo trata como verificación criptográfica', async () => {
    const { target, input } = evidenceFixture();
    const router = new QaBalanceContextRouter();
    const row = parseQaAtmEvidenceBindings(input)[0]!;
    router.bind(documentedQaAtmContextBinding(row));
    row.keyCheckValue = 'FFFFFF';
    const readiness = await router.inspect(target);
    expect(readiness.ready).toBe(false);
    expect(JSON.stringify(readiness)).not.toMatch(/ABCDEF|FFFFFF|KCV|keyCheckValue/);
  });
});
