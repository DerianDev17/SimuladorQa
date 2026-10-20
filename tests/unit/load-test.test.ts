import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LOAD_TEST_LOCAL_MAX_TPS, parseLoadTestDraft } from '../../packages/domain/src/load-test';

const validDraft = () => ({
  environment: 'QA',
  mode: 'LOAD',
  operation: 'BALANCE',
  atmId: randomUUID(),
  atmRevision: 1,
  maxTransactions: 10,
  targetTps: LOAD_TEST_LOCAL_MAX_TPS,
  concurrency: 1,
  rampUpSeconds: 0,
  durationSeconds: 10,
});

describe('validación del borrador de carga de saldo', () => {
  it('acepta 5 TPS como techo local y no permite superar el límite', () => {
    const draft = validDraft();
    expect(parseLoadTestDraft(draft)).toEqual(draft);
    expect(parseLoadTestDraft({ ...draft, targetTps: 5.001 })).toBeUndefined();
  });

  it('solo admite consultas QA y descarta operaciones financieras distintas', () => {
    const draft = validDraft();
    expect(parseLoadTestDraft({ ...draft, operation: 'WITHDRAWAL' })).toBeUndefined();
    expect(parseLoadTestDraft({ ...draft, environment: 'PREPROD' })).toBeUndefined();
    expect(parseLoadTestDraft({ ...draft, cardData: 'private-test-value' })).toBeUndefined();
  });
});
