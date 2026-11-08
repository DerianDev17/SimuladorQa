import { balanceLease, balanceRequest, balanceResponse, balanceTarget } from './balance-inquiry';
import type { CapturedBalanceMetadata } from '../../apps/desktop/src/main/financial-message-contract';

// Synthetic bytes only. These helpers are not captured financial evidence or EMV vectors.
export function depositFixture(amount = '10.00') {
  const target = balanceTarget();
  target.draft = { ...target.draft, transaction: 'DEPOSIT', amount };
  return {
    target,
    request: balanceRequest(target),
    lease: { ...balanceLease(target), amount },
  };
}

export function depositResponse(
  metadata: CapturedBalanceMetadata,
  code = '12',
  change?: (fields: Map<number, Buffer>) => void,
): Buffer {
  return balanceResponse(metadata, code, (fields) => {
    fields.set(3, Buffer.from('211000', 'hex'));
    fields.set(4, Buffer.from(metadata.amount!, 'hex'));
    fields.delete(54);
    change?.(fields);
  });
}
