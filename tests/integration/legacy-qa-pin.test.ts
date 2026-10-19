import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { LegacyQaPinEncryption } from '../../apps/desktop/src/main/adapters/legacy-qa-pin';
import { selectCoonectaSequence } from '../../apps/desktop/src/main/adapters/coonecta-sequence-policy';
import { BalanceInquiryService } from '../../apps/desktop/src/main/balance-inquiry-service';
import type {
  BalanceJournal,
  BalanceTransport,
  BalanceExchangeRequest,
  BalanceExchangeResult,
} from '../../apps/desktop/src/main/balance-ports';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import {
  balanceTarget,
  balanceRequest,
  balanceLease,
  fixtureFields,
} from '../helpers/balance-inquiry';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';

const runtime = {
  agentId: randomUUID(),
  hostname: 'synthetic',
  user: 'test',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-10-12T20:00:00.000Z',
};

describe('preparación PIN + proveedor + builder de saldo con cifrador sintético', () => {
  async function fixture(fails: boolean) {
    let records: BalanceExecution[] = [];
    const journal: BalanceJournal = {
      read: async () => structuredClone(records),
      write: async (items) => {
        records = structuredClone([...items]);
      },
    };
    const output = Buffer.alloc(8, 0xa5);
    const pin = new LegacyQaPinEncryption({
      encrypt: async () => {
        if (fails) throw Error('private-cipher-error');
        return output;
      },
    });
    const transport: BalanceTransport = {
      exchange: vi.fn(async (request: BalanceExchangeRequest): Promise<BalanceExchangeResult> => {
        const decoder = new CapturedVisaFraming().decoder();
        const frame = decoder.push(request.wire)[0]!;
        decoder.finish();
        const fields = fixtureFields(frame.opaqueBody);
        try {
          expect(fields.get(52)).toEqual(Buffer.alloc(8, 0xa5));
          expect(fields.get(11)).toEqual(Buffer.from('007923', 'hex'));
          expect(records[0]?.outcome).toBe('PENDING');
        } finally {
          for (const field of fields.values()) field.fill(0);
          frame.opaqueBody.fill(0);
          frame.extension.fill(0);
        }
        return {
          outcome: 'NOT_APPROVED',
          transmissionAttempted: true,
          bytesQueued: request.wire.length,
          elapsedMs: 1,
          responseCode: '91',
          balances: [],
        };
      }),
    };
    const service = new BalanceInquiryService(journal, transport, runtime, {
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire: async (target, signal) => {
        const encrypted = await pin.encrypt(
          {
            environment: 'QA',
            pan: Buffer.from('9'.repeat(16)),
            pin: Buffer.from('1234'),
            keyReference: randomUUID(),
          },
          signal,
        );
        const lease = balanceLease(target);
        const decision = selectCoonectaSequence({
          autoJournal: 'N',
          atmSerial: lease.sequence,
          binRegistered: null,
        });
        if (decision.source !== 'ATM_SERIAL') throw Error('TEST_SEQUENCE_UNAVAILABLE');
        lease.sequence = decision.sequence;
        const fields = new Map(lease.privateFields);
        fields.get(52)?.fill(0);
        fields.set(52, encrypted);
        return { ...lease, privateFields: fields };
      },
    });
    const target = balanceTarget();
    const result = await service.execute(
      balanceRequest(target),
      target,
      { connect: 100, response: 100 },
      async () => true,
    );
    return { result, transport, output, records };
  }
  it('incorpora el bloque cifrado en F52 y conserva respuesta recibida sin inventar saldo', async () => {
    const f = await fixture(false);
    expect(f.result).toMatchObject({
      ok: true,
      value: { outcome: 'NOT_APPROVED', responseCode: '91' },
    });
    expect(f.transport.exchange).toHaveBeenCalledOnce();
    expect(f.output.every((byte) => byte === 0)).toBe(true);
    expect(JSON.stringify(f.records)).not.toMatch(
      /privateFields|keyReference|private-cipher-error/,
    );
  });
  it('impide transporte y registra el error protegido si falla el cifrador', async () => {
    const f = await fixture(true);
    expect(f.result).toMatchObject({
      ok: true,
      value: { outcome: 'CONTEXT_ERROR', transmissionAttempted: false },
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
    expect(f.records).toMatchObject([
      { outcome: 'CONTEXT_ERROR', frameGenerated: false, transmissionAttempted: false },
    ]);
    expect(JSON.stringify(f.result)).not.toContain('private-cipher-error');
  });
});
