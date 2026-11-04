import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LOAD_TEST_LOCAL_MAX_TPS,
  parseLoadTestDraft,
  loadTestAtms,
} from '../../packages/domain/src/load-test';

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
  it('conserva el formato histórico y valida listas ordenadas de ATM sin duplicados ni secretos', () => {
    const first = validDraft();
    const second = { atmId: randomUUID(), atmRevision: 2 };
    const plan = parseLoadTestDraft({ ...first, additionalAtms: [second] });
    expect(plan).toBeDefined();
    expect(loadTestAtms(plan!)).toEqual([{ atmId: first.atmId, atmRevision: 1 }, second]);
    for (const additionalAtms of [
      [],
      undefined,
      null,
      'invalid',
      [second, second],
      [{ atmId: first.atmId, atmRevision: 2 }],
      [{ ...second, atmRevision: 0 }],
      [{ ...second, atmId: 'invalid' }],
      [{ ...second, pin: 'PRIVATE' }],
      Array.from({ length: 100 }, () => ({ atmId: randomUUID(), atmRevision: 1 })),
    ])
      expect(parseLoadTestDraft({ ...first, additionalAtms })).toBeUndefined();
    expect(parseLoadTestDraft(first)).toEqual(first);
  });
  it('acepta 5 TPS como techo local y no permite superar el límite', () => {
    const draft = validDraft();
    expect(parseLoadTestDraft(draft)).toEqual(draft);
    expect(parseLoadTestDraft({ ...draft, targetTps: 5.001 })).toBeUndefined();
  });

  it('admite retiro QA con monto exacto y rechaza montos inválidos o campos ajenos', () => {
    const draft = { ...validDraft(), operation: 'WITHDRAWAL', amount: '75.25' };
    expect(parseLoadTestDraft(draft)).toEqual(draft);
    for (const amount of [
      undefined,
      null,
      20,
      '',
      '0.00',
      '-1.00',
      '20',
      '20.1',
      '20,00',
      '1e2',
      '10000000000.00',
    ])
      expect(parseLoadTestDraft({ ...draft, amount })).toBeUndefined();
    expect(parseLoadTestDraft({ ...draft, operation: 'BALANCE' })).toBeUndefined();
    expect(parseLoadTestDraft({ ...draft, reversalDelaySeconds: 5 })).toBeUndefined();
    expect(parseLoadTestDraft({ ...draft, mode: 'STRESS', rampUpSeconds: 2 })).toBeDefined();
  });
  it('solo admite saldo o retiro QA y descarta operaciones financieras distintas', () => {
    const draft = validDraft();
    expect(parseLoadTestDraft({ ...draft, operation: 'WITHDRAWAL' })).toBeUndefined();
    expect(
      parseLoadTestDraft({ ...draft, operation: 'REVERSAL', amount: '20.00' }),
    ).toBeUndefined();
    expect(parseLoadTestDraft({ ...draft, environment: 'PREPROD' })).toBeUndefined();
    expect(parseLoadTestDraft({ ...draft, cardData: 'private-test-value' })).toBeUndefined();
  });
});
