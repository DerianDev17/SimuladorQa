import { describe, expect, it } from 'vitest';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import { dashboardActivityRows } from '../../apps/desktop/src/renderer/dashboard-activity';

describe('actividad de Inicio', () => {
  it('muestra ejecuciones transmitidas con referencias reales y sin datos de tarjeta', () => {
    const withdrawal = approvedWithdrawalExecution();
    const rows = dashboardActivityRows([withdrawal]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operation: 'Retiro',
      amount: '20.00',
      terminalId: 'ATM20521',
      outcome: 'Autorizado por el host',
      responseCode: '00',
      elapsedMs: 250,
      reference: '000123',
    });
    expect(JSON.stringify(rows)).not.toContain(withdrawal.cardReadId);
  });

  it('excluye bloqueos sin transmisión y distingue preparación de envío', () => {
    const record = approvedWithdrawalExecution();
    const blocked = { ...record, outcome: 'BLOCKED' as const, transmissionAttempted: false };
    const pending = {
      ...record,
      transactionId: 'a-pending-transaction',
      outcome: 'PENDING' as const,
      responseCode: null,
      finishedAt: null,
      transmissionAttempted: false,
    };
    expect(dashboardActivityRows([blocked])).toEqual([]);
    expect(dashboardActivityRows([pending])[0]).toMatchObject({
      outcome: 'En preparación',
      elapsedMs: null,
      responseCode: null,
    });
    expect(dashboardActivityRows([{ ...pending, frameGenerated: false }])).toEqual([]);
  });

  it('crea una fila de reverso solo si se intentó transmitir', () => {
    const record = approvedWithdrawalExecution();
    const reversal = {
      transactionId: 'reversal-id',
      delaySeconds: 3,
      outcome: 'APPROVED' as const,
      dueAt: '2026-10-19T20:00:03.000Z',
      finishedAt: '2026-10-19T20:00:03.100Z',
      responseCode: '00',
      transmissionAttempted: true,
      bytesQueued: 400,
    };
    expect(dashboardActivityRows([{ ...record, reversal }])).toMatchObject([
      { operation: 'Reverso', outcome: 'Aceptado por el host' },
      { operation: 'Retiro', outcome: 'Autorizado por el host' },
    ]);
    expect(
      dashboardActivityRows([
        { ...record, reversal: { ...reversal, transmissionAttempted: false } },
      ]),
    ).toHaveLength(1);
  });
});
