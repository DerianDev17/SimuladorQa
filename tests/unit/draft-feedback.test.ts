import { describe, expect, it } from 'vitest';
import { localDraftChecks } from '../../apps/desktop/src/renderer/draft-feedback';
import { draftBlockers } from '../../packages/domain/src/transaction-draft';

const context = {
  transaction: 'BALANCE' as const,
  amount: '',
  environmentVerified: true,
  atmSelected: true,
  catalogAvailable: true,
  operationAvailable: true,
  original: false,
};
describe('preparación local y requisitos en vivo', () => {
  it('distingue entradas completadas de un perfil QA validado o envío autorizado', () => {
    const checks = localDraftChecks(context);
    expect(checks.every((check) => check.complete)).toBe(true);
    expect(checks.find((check) => check.key === 'atm')?.detail).toContain('borrador');
    expect(draftBlockers('BALANCE', true).map((blocker) => blocker.id)).toContain('PROFILES');
  });
  it('marca dependencias locales no disponibles y selección ausente', () => {
    const checks = localDraftChecks({
      ...context,
      environmentVerified: false,
      catalogAvailable: false,
      operationAvailable: false,
    });
    expect(checks.filter((check) => check.complete)).toHaveLength(0);
    expect(
      localDraftChecks({ ...context, atmSelected: false }).find((check) => check.key === 'atm')
        ?.complete,
    ).toBe(false);
  });
  it.each(['', '1e2', '100,50', '-100.50', '001.00', '100.501'])(
    'detecta monto incompleto o inválido sin corregirlo: %s',
    (amount) => {
      expect(
        localDraftChecks({ ...context, transaction: 'WITHDRAWAL_APPROVED', amount }).find(
          (check) => check.key === 'amount',
        )?.complete,
      ).toBe(false);
    },
  );
  it('valida solamente el formato y mantiene pendientes los límites financieros', () => {
    expect(
      localDraftChecks({ ...context, transaction: 'WITHDRAWAL_DECLINED', amount: '0.00' }).find(
        (check) => check.key === 'amount',
      ),
    ).toMatchObject({ complete: true, detail: expect.stringContaining('pendiente') });
    expect(draftBlockers('WITHDRAWAL_DECLINED', true).map((blocker) => blocker.id)).toContain(
      'AMOUNT_RULES',
    );
  });
  it.each(['REVERSAL', 'TIMEOUT_REVERSAL'] as const)(
    'muestra la dependencia del original desde la selección de %s',
    (transaction) => {
      expect(
        localDraftChecks({ ...context, transaction, original: true }).find(
          (check) => check.key === 'operation',
        )?.complete,
      ).toBe(false);
      expect(draftBlockers(transaction, true).map((blocker) => blocker.id)).toContain(
        'ORIGINAL_TRANSACTION',
      );
    },
  );
  it('mantiene la fuente pendiente cuando falta un código documentado', () => {
    expect(draftBlockers('BALANCE', false).map((blocker) => blocker.id)).toContain(
      'OPERATION_CATALOG',
    );
  });
});
