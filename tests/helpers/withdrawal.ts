import {
  balanceLease,
  balanceRequest,
  balanceResponse,
  balanceTarget,
  ebcdicNumeric,
} from './balance-inquiry';
import type { CapturedBalanceMetadata } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import { randomUUID } from 'node:crypto';

export function approvedWithdrawalExecution(): BalanceExecution {
  return {
    requestId: randomUUID(),
    runId: randomUUID(),
    transactionId: randomUUID(),
    environment: 'QA',
    atmId: randomUUID(),
    atmRevision: 1,
    configurationRevision: 1,
    cardReadId: randomUUID(),
    startedAt: '2026-10-19T20:00:00.000Z',
    finishedAt: '2026-10-19T20:00:00.250Z',
    scenario: 'LOCAL',
    outcome: 'APPROVED',
    frameGenerated: true,
    transmissionAttempted: true,
    bytesQueued: 548,
    elapsedMs: 250,
    correlation: {
      stan: '000123',
      rrn: '6292' + String(123).padStart(8, '0'),
      terminalId: 'ATM20521',
    },
    responseCode: '00',
    blockers: [],
    balances: [
      { accountCode: '10', type: '02', currency: '840', amount: '123.45' },
      { accountCode: '10', type: '01', currency: '840', amount: '234.56' },
    ],
    withdrawal: {
      transaction: 'WITHDRAWAL_APPROVED',
      account: 'SAVINGS',
      currency: '840',
      amount: '20.00',
    },
  };
}

export function withdrawalFixture(amount = '20.00') {
  const target = balanceTarget();
  target.draft = { ...target.draft, transaction: 'WITHDRAWAL_APPROVED', amount };
  const request = balanceRequest(target);
  const lease = { ...balanceLease(target), amount };
  return { target, request, lease };
}

// Synthetic private bytes. Public F3/F4/F38 layout follows frames 248/254;
// not an EMV vector or approval of a production/QA security configuration.
export function withdrawalResponse(
  metadata: CapturedBalanceMetadata,
  code = '00',
  change?: (fields: Map<number, Buffer>) => void,
): Buffer {
  return balanceResponse(metadata, code, (fields) => {
    fields.set(3, Buffer.from('011000', 'hex'));
    fields.set(4, Buffer.from(metadata.amount!, 'hex'));
    fields.set(38, ebcdicNumeric('123456'));
    change?.(fields);
  });
}
