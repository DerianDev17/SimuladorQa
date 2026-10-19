import { describe, expect, it } from 'vitest';
import {
  parseBalanceDiagnostics,
  balanceResponseConfirmed,
} from '../../packages/domain/src/balance-inquiry';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';

const diagnostics = {
  profileId: 'c4d26867-a1ba-4e21-9d74-c60ccdc9d408',
  accountingDate: '2026-10-15',
  terminalApplicationVersion: '008C',
  cardApplicationVersion: '00A0',
  tvr: '8080800000',
  cvmResult: '3F0001',
};
describe('diagnóstico público y resultado confirmado', () => {
  it('conserva exclusivamente las seis propiedades públicas', () => {
    expect(parseBalanceDiagnostics(diagnostics)).toEqual(diagnostics);
    expect(parseBalanceDiagnostics({ ...diagnostics, pinBlock: 'PRIVATE' })).toBeUndefined();
  });
  it.each([
    { accountingDate: '2026-02-30' },
    { tvr: 'SECRET' },
    { cvmResult: '0' },
    { profileId: 'not-uuid' },
    { cardApplicationVersion: 'X' },
  ])('rechaza datos no verificables sin completar valores', (invalid) => {
    expect(parseBalanceDiagnostics({ ...diagnostics, ...invalid })).toBeUndefined();
  });
  it.each(['APPROVED', 'NOT_APPROVED'] as const)(
    'libera el formulario tras %s confirmado',
    (outcome) => {
      expect(
        balanceResponseConfirmed({
          outcome,
          finishedAt: '2026-10-15T14:46:31.395Z',
          responseCode: outcome === 'APPROVED' ? '00' : '19',
        } as BalanceExecution),
      ).toBe(true);
    },
  );
  it.each(['PENDING', 'RESPONSE_TIMEOUT', 'STORAGE_ERROR', 'TRANSPORT_ERROR'] as const)(
    'conserva protección de reenvío para %s',
    (outcome) => {
      expect(
        balanceResponseConfirmed({
          outcome,
          finishedAt: null,
          responseCode: null,
        } as BalanceExecution),
      ).toBe(false);
    },
  );
});
