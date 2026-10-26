import { describe, expect, it } from 'vitest';
import {
  caseMatchesDraft,
  evaluateCase,
  parseCaseValues,
} from '../../packages/domain/src/saved-cases';
import type { SavedCase } from '../../packages/domain/src/saved-cases';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';

const atmId = 'aabbccdd-aabb-4cdd-8aab-aabbccddeeff';
const saved: SavedCase = {
  id: 'bbccddee-bbcc-4dee-8bbc-bbccddeeff00',
  revision: 1,
  status: 'DRAFT',
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
  environment: 'QA',
  name: 'Saldo esperado',
  draft: {
    environment: 'QA',
    transaction: 'BALANCE',
    scenario: 'LOCAL',
    atmId,
    atmRevision: 1,
    account: 'SAVINGS',
    amount: null,
  },
  expectation: {
    outcome: 'APPROVED',
    responseCode: '00',
    source: 'docs/transactions/BALANCE_INQUIRY.md',
  },
  evidenceDocuments: [],
};
const execution: BalanceExecution = {
  requestId: 'ccddeeff-ccdd-4eff-8ccd-ccddeeff0011',
  runId: 'ddeeff00-ddee-4f00-8dde-ddeeff001122',
  transactionId: 'eeff0011-eeff-4011-8eef-eeff00112233',
  environment: 'QA',
  atmId,
  atmRevision: 1,
  configurationRevision: 1,
  cardReadId: 'ff001122-ff00-4122-8f00-ff0011223344',
  startedAt: '2026-10-26T12:00:00.000Z',
  scenario: 'LOCAL',
  finishedAt: '2026-10-26T12:00:01.000Z',
  outcome: 'APPROVED',
  frameGenerated: true,
  transmissionAttempted: true,
  bytesQueued: 100,
  elapsedMs: 1000,
  correlation: { stan: '900110', rrn: 'RRN-SYNTH', terminalId: 'ATM20521' },
  responseCode: '00',
  balances: [],
  blockers: [],
};

describe('expectativa y veredicto local', () => {
  it('valida una expectativa explícita y rechaza reglas o datos no permitidos', () => {
    expect(caseMatchesDraft(saved, { ...saved.draft })).toBe(true);
    expect(caseMatchesDraft(saved, { ...saved.draft, account: 'CURRENT' })).toBe(false);
    expect(
      parseCaseValues({ name: saved.name, draft: saved.draft, expectation: saved.expectation }),
    ).toMatchObject({ expectation: saved.expectation });
    for (const expectation of [
      { ...saved.expectation, outcome: 'TIMEOUT' },
      { ...saved.expectation, responseCode: '000' },
      { ...saved.expectation, source: '' },
      { ...saved.expectation, source: 'PIN 1234' },
      { ...saved.expectation, raw: 'private' },
    ])
      expect(
        parseCaseValues({ name: saved.name, draft: saved.draft, expectation }),
      ).toBeUndefined();
  });

  it('distingue aprobación de prueba, rechazo esperado y diferencia real', () => {
    expect(evaluateCase(saved, execution).status).toBe('PASS');
    expect(evaluateCase(saved, { ...execution, responseCode: '05' })).toMatchObject({
      status: 'FAIL',
      checks: [{ pass: true }, { pass: false }],
    });
    const declined = {
      ...saved,
      expectation: { ...saved.expectation!, outcome: 'NOT_APPROVED' as const, responseCode: '05' },
    };
    expect(
      evaluateCase(declined, { ...execution, outcome: 'NOT_APPROVED', responseCode: '05' }).status,
    ).toBe('PASS');
    expect(evaluateCase(declined, execution).status).toBe('FAIL');
  });

  it('no da PASS a un bloqueo, timeout, ausencia de correlación o contexto ajeno', () => {
    for (const attempt of [
      { ...execution, outcome: 'BLOCKED' as const, transmissionAttempted: false },
      { ...execution, outcome: 'RESPONSE_TIMEOUT' as const, responseCode: null },
      { ...execution, correlation: null },
      { ...execution, atmId: 'other' },
    ])
      expect(evaluateCase(saved, attempt).status).toBe('INCONCLUSIVE');
    const withoutExpectation = { ...saved };
    delete withoutExpectation.expectation;
    expect(evaluateCase(withoutExpectation, execution).status).toBe('INCONCLUSIVE');
  });
});
