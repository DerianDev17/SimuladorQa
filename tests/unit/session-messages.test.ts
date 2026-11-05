import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  SessionMessageStore,
  sessionMessageLifetimeMs,
} from '../../apps/desktop/src/main/infrastructure/session-message-store';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { projectSessionIsoMessage } from '../../apps/desktop/src/main/adapters/iso-message-projection';
import { capturedBalanceRequest } from '../helpers/captured-visa-balance';
import { parseIsoMessage, protectedIsoValue } from '../../packages/domain/src/iso-message';
import { formatIsoMessageText } from '../../apps/desktop/src/renderer/transaction-message-text';
import { captureSessionMessage } from '../../apps/desktop/src/main/adapters/session-message-capture';
import type { BalanceExchangeRequest } from '../../apps/desktop/src/main/balance-ports';

afterEach(() => vi.useRealTimers());
describe('mensajes completos de sesión QA', () => {
  const codec = new CapturedVisaBalance();
  it('muestra valores sin máscara y rechaza el DTO en la persistencia pública', () => {
    const body = capturedBalanceRequest();
    const complete = codec.sessionMessage(body);
    expect(complete.fields.map((f) => f.number)).toEqual(
      codec.message(body).fields.map((f) => f.number),
    );
    expect(complete.fields.some((f) => f.value === protectedIsoValue)).toBe(false);
    expect(complete.fields.find((f) => f.number === 2)?.value === '411111' + '0'.repeat(10)).toBe(
      true,
    );
    expect(complete.fields.find((f) => f.number === 52)?.value.startsWith('HEX ')).toBe(true);
    expect(parseIsoMessage(complete)).toBeUndefined();
    expect(parseIsoMessage({ mti: complete.mti, fields: complete.fields })).toBeUndefined();
    body.fill(0);
    expect(formatIsoMessageText(complete).startsWith('REQ · ISO8583')).toBe(true);
  });
  it('conserva binarios, textos no soportados y todos los tags sin adivinar subcampos', () => {
    const tlv = Buffer.from('9F2608DEADBEEFDEADBEEF', 'hex');
    const message = projectSessionIsoMessage(
      '0210',
      new Map([
        [44, Buffer.of(1, 0xff)],
        [55, Buffer.concat([Buffer.of(tlv.length + 3, 1, 0, tlv.length), tlv])],
      ]),
      {
        44: { encoding: 'EBCDIC', length: 25, variable: true },
        55: { encoding: 'BINARY', length: 255, variable: true },
      },
    );
    expect(message.fields[0]?.value).toBe('HEX FF');
    expect(message.fields[1]?.tags?.[0]?.value === 'DEADBEEFDEADBEEF').toBe(true);
    expect(formatIsoMessageText(message)).toContain('9F26 · Tag EMV');
  });
  it('acota a 20 solicitudes, clona datos y caduca sin lecturas adicionales', () => {
    vi.useFakeTimers();
    const store = new SessionMessageStore();
    const id = randomUUID();
    const message = codec.sessionMessage(capturedBalanceRequest());
    store.capture('invalid', message);
    expect(store.read('invalid')).toBeNull();
    store.capture(id, message);
    const copy = store.read(id)!;
    copy.messages = {};
    expect(store.read(id)?.messages['0200']).toBeDefined();
    for (let i = 0; i < 20; i++) store.capture(randomUUID(), message);
    expect(store.read(id)).toBeNull();
    store.capture(id, message);
    vi.advanceTimersByTime(sessionMessageLifetimeMs);
    expect(store.read(id)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    store.capture(id, message);
    store.clear();
    expect(store.read(id)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('un fallo de diagnóstico no interrumpe el transporte y PROD no captura', () => {
    const project = vi.fn(() => codec.sessionMessage(capturedBalanceRequest()));
    const request = {
      environment: 'QA',
      onSessionMessage: () => {
        throw Error('SINK_UNAVAILABLE');
      },
    } as unknown as BalanceExchangeRequest;
    expect(() => captureSessionMessage(request, project)).not.toThrow();
    expect(project).toHaveBeenCalledOnce();
    captureSessionMessage(
      { ...request, environment: 'PROD' } as unknown as BalanceExchangeRequest,
      project,
    );
    expect(project).toHaveBeenCalledOnce();
  });
});
