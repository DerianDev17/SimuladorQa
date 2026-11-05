import { describe, expect, it } from 'vitest';
import {
  executionCategory,
  executionStages,
  filterExecutionHistory,
  mergeExecutionHistory,
} from '../../apps/desktop/src/renderer/transaction-inspection';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';

describe('inspección basada en evidencia guardada', () => {
  it('proyecta un aprobado sin inventar Core, dispensación ni tiempos por etapa', () => {
    const record = approvedWithdrawalExecution();
    const before = structuredClone(record);
    const stages = executionStages(record, true);
    expect(stages.map((stage) => stage.state)).toEqual([
      'complete',
      'complete',
      'complete',
      'complete',
      'complete',
    ]);
    expect(stages.map((stage) => stage.id)).not.toContain('core');
    expect(stages[3]?.detail).toContain('No certifica débito ni dispensación');
    expect(record).toEqual(before);
  });
  it.each(['RESPONSE_TIMEOUT', 'INVALID_RESPONSE', 'PEER_CLOSED'] as const)(
    'no fabrica respuesta o validación después de %s',
    (outcome) => {
      const record = { ...approvedWithdrawalExecution(), outcome, responseCode: null };
      const stages = executionStages(record, true);
      expect(stages.find((stage) => stage.id === 'response')?.state).toBe('attention');
      expect(stages.find((stage) => stage.id === 'validation')?.state).toBe('unavailable');
      expect(executionCategory(record)).toBe('review');
    },
  );
  it('distingue preparación bloqueada, intento de transporte y guardado fallido', () => {
    const blocked: BalanceExecution = {
      ...approvedWithdrawalExecution(),
      outcome: 'BLOCKED',
      frameGenerated: false,
      transmissionAttempted: false,
      bytesQueued: 0,
      responseCode: null,
      correlation: null,
    };
    expect(
      executionStages(blocked, false)
        .slice(0, 2)
        .map((stage) => stage.state),
    ).toEqual(['attention', 'unavailable']);
    expect(executionCategory(blocked)).toBe('blocked');
    expect(executionStages({ ...blocked, transmissionAttempted: true }, false)[1]?.state).toBe(
      'attention',
    );
    expect(executionStages({ ...blocked, outcome: 'STORAGE_ERROR' }, true).at(-1)?.state).toBe(
      'attention',
    );
  });
  it('no confunde un resultado de sesión con una versión recuperada del diario', () => {
    expect(executionStages(approvedWithdrawalExecution(), false).at(-1)?.state).toBe('pending');
  });
  it('conserva el resultado del retiro separado del reverso', () => {
    const record = approvedWithdrawalExecution();
    record.reversal = {
      transactionId: record.transactionId,
      delaySeconds: 5,
      outcome: 'WAITING',
      dueAt: record.finishedAt,
      finishedAt: null,
      responseCode: null,
      transmissionAttempted: false,
      bytesQueued: 0,
    };
    expect(executionCategory(record)).toBe('pending');
    expect(executionStages(record, true).find((stage) => stage.id === 'reversal')).toMatchObject({
      state: 'pending',
      message: 'reversal-request',
    });
    const failed = {
      ...record,
      reversal: {
        ...record.reversal,
        outcome: 'UNCONFIRMED' as const,
        finishedAt: record.finishedAt,
      },
    };
    expect(executionCategory(failed)).toBe('review');
    expect(executionStages(failed, true).find((stage) => stage.id === 'reversal')?.state).toBe(
      'attention',
    );
  });
});
describe('historial combinado e independiente del borrador', () => {
  it('deduplica por solicitud sin regresar de un final a un pendiente tardío', () => {
    const final = approvedWithdrawalExecution();
    const pending = { ...final, outcome: 'PENDING' as const, finishedAt: null, responseCode: null };
    expect(mergeExecutionHistory([final], [pending])).toEqual([final]);
    expect(mergeExecutionHistory([pending], [final], [final])).toEqual([final]);
  });
  it('no regresa un reverso en envío a su espera con la misma fecha del retiro', () => {
    const record = approvedWithdrawalExecution();
    record.reversal = {
      transactionId: record.transactionId,
      delaySeconds: 5,
      outcome: 'WAITING',
      dueAt: record.finishedAt,
      finishedAt: null,
      responseCode: null,
      transmissionAttempted: false,
      bytesQueued: 0,
    };
    const sending = {
      ...record,
      reversal: { ...record.reversal, outcome: 'SENDING' as const, transmissionAttempted: true },
    };
    expect(mergeExecutionHistory([sending], [record])).toEqual([sending]);
  });
  it('combina filtro, acentos y referencias sin modificar el registro', () => {
    const withdrawal = approvedWithdrawalExecution();
    const balance = approvedWithdrawalExecution();
    delete balance.withdrawal;
    const items = [withdrawal, balance];
    const before = structuredClone(items);
    const filter = { query: '  CONSULTA DE SALDO  ', atmId: '', outcome: 'approved' as const };
    expect(filterExecutionHistory(items, filter)).toEqual([balance]);
    expect(filterExecutionHistory(items, { ...filter, query: withdrawal.requestId })).toEqual([
      withdrawal,
    ]);
    expect(
      filterExecutionHistory(items, { ...filter, query: '', atmId: withdrawal.atmId }),
    ).toEqual([withdrawal]);
    expect(filterExecutionHistory(items, { ...filter, query: 'inexistente' })).toEqual([]);
    expect(filterExecutionHistory(items, { ...filter, query: '', outcome: 'pending' })).toEqual([]);
    expect(items).toEqual(before);
  });
});
