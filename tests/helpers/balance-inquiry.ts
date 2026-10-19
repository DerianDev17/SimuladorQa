import { randomUUID } from 'node:crypto';
import type { BalanceTarget, BalanceContextLease } from '../../apps/desktop/src/main/balance-ports';
import type { BalanceExecutionRequest } from '../../packages/domain/src/balance-inquiry';
import type { CapturedBalanceMetadata } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { capturedBalanceRequest, capturedBalanceResponse } from './captured-visa-balance';

// Synthetic encoded fixture spans, never a real captured PIN/EMV source.
const widths: Record<number, number> = {
  3: 3,
  4: 6,
  7: 5,
  11: 3,
  12: 3,
  13: 2,
  14: 2,
  15: 2,
  18: 2,
  19: 2,
  22: 2,
  23: 2,
  25: 1,
  28: 9,
  37: 12,
  38: 6,
  39: 2,
  41: 8,
  42: 15,
  43: 40,
  49: 2,
  52: 8,
  53: 8,
};
const variableBcd = new Set([2, 32, 35]);
export function fixtureFields(body: Buffer): Map<number, Buffer> {
  const output = new Map<number, Buffer>();
  let cursor = 32;
  for (let field = 2; field <= 64; field++) {
    if (!(body[24 + Math.floor((field - 1) / 8)]! & (0x80 >> ((field - 1) % 8)))) continue;
    const start = cursor;
    const fixed = widths[field];
    if (fixed) cursor += fixed;
    else {
      const size = body[cursor++]!;
      cursor += variableBcd.has(field) ? Math.ceil(size / 2) : size;
    }
    output.set(field, Buffer.from(body.subarray(start, cursor)));
  }
  return output;
}
export function balanceTarget(): BalanceTarget {
  return {
    draft: {
      environment: 'QA',
      transaction: 'BALANCE',
      scenario: 'LOCAL',
      atmId: randomUUID(),
      atmRevision: 1,
      account: 'SAVINGS',
      amount: null,
    },
    configurationRevision: 1,
    cardReadId: randomUUID(),
    terminalId: 'ATM20521',
    endpoint: { host: '127.0.0.1', port: 16100 },
  };
}
export function balanceRequest(target: BalanceTarget): BalanceExecutionRequest {
  return {
    draft: target.draft,
    configurationRevision: target.configurationRevision,
    cardReadId: target.cardReadId,
    requestId: randomUUID(),
  };
}
export function balanceLease(target: BalanceTarget): BalanceContextLease {
  const body = capturedBalanceRequest();
  const fields = fixtureFields(body);
  for (const field of [3, 4, 7, 11, 12, 13, 15, 37, 41]) {
    fields.get(field)!.fill(0);
    fields.delete(field);
  }
  const header = Buffer.from(body.subarray(0, 22));
  body.fill(0);
  const date = { year: 2026, month: 10, day: 8, hour: 12, minute: 41, second: 23 };
  return {
    environment: 'QA',
    profileId: randomUUID(),
    cardReadId: target.cardReadId,
    endpoint: { ...target.endpoint },
    securitySource: 'GENERATED_TEST_SESSION',
    validUntil: '2026-10-12T22:00:00.000Z',
    release: () => undefined,
    account: 'SAVINGS',
    sequence: 7923,
    transmission: { ...date },
    local: { ...date },
    accounting: { ...date },
    terminalId: target.terminalId,
    header,
    extension: Buffer.alloc(2),
    privateFields: fields,
  };
}
export function ebcdicNumeric(text: string): Buffer {
  return Buffer.from([...text].map((digit) => 0xf0 + Number(digit)));
}
export function balanceResponse(
  metadata: CapturedBalanceMetadata,
  code = '00',
  change?: (fields: Map<number, Buffer>) => void,
): Buffer {
  const original = capturedBalanceResponse(code);
  const values = fixtureFields(original);
  values.set(11, Buffer.from(metadata.stan, 'hex'));
  values.set(37, ebcdicNumeric(metadata.rrn));
  const valueText =
    '10' +
    '02' +
    '840' +
    'C' +
    String(12345).padStart(12, '0') +
    '10' +
    '01' +
    '840' +
    'C' +
    String(23456).padStart(12, '0');
  values.set(
    54,
    Buffer.concat([
      Buffer.of(valueText.length),
      Buffer.from(
        [...valueText].map((character) => (character === 'C' ? 0xc3 : 0xf0 + Number(character))),
      ),
    ]),
  );
  change?.(values);
  const prefix = Buffer.from(original.subarray(0, 32));
  prefix.fill(0, 24, 32);
  for (const field of values.keys()) {
    const offset = 24 + Math.floor((field - 1) / 8);
    prefix[offset] = prefix[offset]! | (0x80 >> ((field - 1) % 8));
  }
  const result = Buffer.concat([
    prefix,
    ...[...values.entries()].sort(([a], [b]) => a - b).map(([, value]) => value),
  ]);
  result.writeUInt16BE(result.length, 3);
  original.fill(0);
  prefix.fill(0);
  for (const value of values.values()) value.fill(0);
  return result;
}
