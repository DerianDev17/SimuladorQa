import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { BalanceInquiryService } from '../../apps/desktop/src/main/balance-inquiry-service';
import { balanceContextErrorLabels } from '../../apps/desktop/src/main/balance-context-errors';
import type {
  BalanceContextLease,
  BalanceContextProvider,
  BalanceJournal,
  BalanceTransport,
  BalanceExchangeResult,
} from '../../apps/desktop/src/main/balance-ports';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import { balanceTarget, balanceRequest, balanceLease } from '../helpers/balance-inquiry';

const runtime = {
  agentId: randomUUID(),
  hostname: 'test-station',
  user: 'test-user',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-10-12T20:00:00.000Z',
};
function fixture(context?: BalanceContextProvider, deadline = 30) {
  let records: BalanceExecution[] = [];
  const journal: BalanceJournal = {
    read: async () => structuredClone(records),
    write: vi.fn(async (value) => {
      records = structuredClone([...value]);
    }),
  };
  const transport: BalanceTransport = {
    exchange: vi.fn(async (): Promise<BalanceExchangeResult> => ({
      outcome: 'APPROVED',
      transmissionAttempted: true,
      bytesQueued: 536,
      elapsedMs: 15,
      responseCode: '00',
      balances: [{ accountCode: '10', type: '02', currency: '840', amount: '123.45' }],
    })),
  };
  const service = new BalanceInquiryService(journal, transport, runtime, context, deadline);
  return { journal, transport, service, records: () => structuredClone(records) };
}
const provider = (): BalanceContextProvider => ({
  inspect: async () => ({ ready: true, blockers: [] }),
  acquire: async (target) => balanceLease(target),
});
describe('orquestación de saldo sin inferir seguridad ni resultados', () => {
  it.each(Object.entries(balanceContextErrorLabels))(
    'conserva el diagnóstico público %s sin transporte y permite otra solicitud explícita',
    async (code, label) => {
      const target = balanceTarget();
      const context = provider();
      context.acquire = vi
        .fn()
        .mockRejectedValueOnce(Error(code))
        .mockImplementation(async (target) => balanceLease(target));
      const f = fixture(context);
      const request = balanceRequest(target);
      const result = await f.service.execute(
        request,
        target,
        { connect: 100, response: 100 },
        async () => true,
      );
      expect(result).toMatchObject({
        ok: true,
        value: {
          outcome: 'CONTEXT_ERROR',
          transmissionAttempted: false,
          bytesQueued: 0,
          blockers: [{ label }],
        },
      });
      expect(f.transport.exchange).not.toHaveBeenCalled();
      expect(
        await f.service.execute(request, target, { connect: 100, response: 100 }, async () => true),
      ).toEqual(result);
      expect(context.acquire).toHaveBeenCalledTimes(1);
      expect(
        await f.service.execute(
          { ...request, requestId: randomUUID() },
          target,
          { connect: 100, response: 100 },
          async () => true,
        ),
      ).toMatchObject({ ok: true, value: { outcome: 'APPROVED' } });
      expect(f.transport.exchange).toHaveBeenCalledTimes(1);
    },
  );
  it('descarta propiedades privadas inesperadas del adaptador de transporte', async () => {
    const target = balanceTarget();
    const f = fixture(provider());
    vi.mocked(f.transport.exchange).mockResolvedValue({
      outcome: 'APPROVED',
      transmissionAttempted: true,
      bytesQueued: 536,
      elapsedMs: 10,
      responseCode: '00',
      balances: [
        { accountCode: '10', type: '02', currency: '840', amount: '1.00', raw: 'private-data' },
      ],
      wire: 'private-data',
    } as never);
    const result = await f.service.execute(
      balanceRequest(target),
      target,
      { connect: 100, response: 100 },
      async () => true,
    );
    expect(result).toMatchObject({ ok: true, value: { outcome: 'APPROVED' } });
    expect(JSON.stringify(result)).not.toContain('private-data');
    expect(JSON.stringify(f.records())).not.toContain('private-data');
  });
  it('agota la consulta de disponibilidad sin abrir transporte', async () => {
    const f = fixture({ ...provider(), inspect: () => new Promise(() => undefined) }, 10);
    expect(await f.service.inspect(balanceTarget())).toMatchObject({
      ready: false,
      blockers: [{ id: 'BALANCE-CONTEXT-UNAVAILABLE' }],
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
  });
  it('bloquea solo la dependencia no configurada sin generar trama ni invocar transporte', async () => {
    const f = fixture();
    const target = balanceTarget();
    const result = await f.service.execute(
      balanceRequest(target),
      target,
      { connect: 100, response: 100 },
      async () => true,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'BLOCKED', frameGenerated: false, transmissionAttempted: false },
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
    expect(f.journal.write).not.toHaveBeenCalled();
  });
  it('registra antes de escribir, recupera sin repetir y elimina buffers de seguridad', async () => {
    const target = balanceTarget();
    const request = balanceRequest(target);
    const lease = balanceLease(target);
    lease.release = vi.fn();
    const f = fixture({ ...provider(), acquire: async () => lease });
    const exchange = vi.mocked(f.transport.exchange);
    exchange.mockImplementation(async () => {
      expect(f.records()[0]!.outcome).toBe('PENDING');
      return {
        outcome: 'APPROVED',
        transmissionAttempted: true,
        bytesQueued: 536,
        elapsedMs: 15,
        responseCode: '00',
        balances: [],
      };
    });
    const result = await f.service.execute(
      request,
      target,
      { connect: 100, response: 100 },
      async () => true,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        outcome: 'APPROVED',
        frameGenerated: true,
        transmissionAttempted: true,
        responseCode: '00',
      },
    });
    expect(lease.header.every((x) => x === 0)).toBe(true);
    expect(lease.privateFields.get(52)!.every((x) => x === 0)).toBe(true);
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(
      await f.service.execute(request, target, { connect: 100, response: 100 }, async () => true),
    ).toEqual(result);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.records())).not.toMatch(/pan|wire|privateFields|pinBlock/i);
  });
  it('comparte ejecución concurrente idéntica y rechaza otra sin doble envío', async () => {
    const target = balanceTarget();
    const request = balanceRequest(target);
    const f = fixture(provider());
    const first = f.service.execute(
      request,
      target,
      { connect: 100, response: 100 },
      async () => true,
    );
    const second = f.service.execute(
      request,
      target,
      { connect: 100, response: 100 },
      async () => true,
    );
    expect(
      await f.service.execute(
        { ...request, requestId: randomUUID() },
        target,
        { connect: 100, response: 100 },
        async () => true,
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(await first).toEqual(await second);
    expect(f.transport.exchange).toHaveBeenCalledTimes(1);
  });
  it('rechaza tarjeta, perfil, expiración o endpoint cambiados antes del transporte', async () => {
    const target = balanceTarget();
    for (const patch of [
      { cardReadId: randomUUID() },
      { securitySource: 'QA_CAPTURE' },
      { validUntil: '2026-10-11T20:00:00.000Z' },
      { endpoint: { host: '127.0.0.2', port: 16100 } },
    ]) {
      const lease = { ...balanceLease(target), ...patch } as BalanceContextLease;
      const f = fixture({ ...provider(), acquire: async () => lease });
      expect(
        await f.service.execute(
          balanceRequest(target),
          target,
          { connect: 100, response: 100 },
          async () => true,
        ),
      ).toMatchObject({
        ok: true,
        value: { outcome: 'CONTEXT_ERROR', transmissionAttempted: false },
      });
      expect(f.transport.exchange).not.toHaveBeenCalled();
    }
  });
  it('revalida justo antes de enviar, incluso después de guardar el registro', async () => {
    const target = balanceTarget();
    const f = fixture(provider());
    const check = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(
      await f.service.execute(
        balanceRequest(target),
        target,
        { connect: 100, response: 100 },
        check,
      ),
    ).toMatchObject({
      ok: true,
      value: { outcome: 'CONTEXT_ERROR', transmissionAttempted: false },
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
  });
  it('agota dependencia no disponible y libera una respuesta tardía sin enviarla', async () => {
    const target = balanceTarget();
    const lease = balanceLease(target);
    lease.release = vi.fn();
    let complete: ((lease: BalanceContextLease) => void) | undefined;
    const f = fixture(
      {
        ...provider(),
        acquire: () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      },
      10,
    );
    expect(
      await f.service.execute(
        balanceRequest(target),
        target,
        { connect: 100, response: 100 },
        async () => true,
      ),
    ).toMatchObject({
      ok: true,
      value: { outcome: 'CONTEXT_ERROR', transmissionAttempted: false },
    });
    complete!(lease);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(f.transport.exchange).not.toHaveBeenCalled();
  });
  it('no escribe si falla el historial y conserva PENDING cuando falla el guardado final', async () => {
    const target = balanceTarget();
    const f = fixture(provider());
    vi.mocked(f.journal.write).mockRejectedValueOnce(Error('private-secret'));
    expect(
      await f.service.execute(
        balanceRequest(target),
        target,
        { connect: 100, response: 100 },
        async () => true,
      ),
    ).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(f.transport.exchange).not.toHaveBeenCalled();
    const g = fixture(provider());
    const request = balanceRequest(target);
    const save = g.journal.write;
    g.journal.write = vi.fn(async (records) => {
      if (records.at(-1)?.outcome === 'APPROVED') throw Error('private-secret');
      await save(records);
    });
    expect(
      await g.service.execute(request, target, { connect: 100, response: 100 }, async () => true),
    ).toMatchObject({ ok: true, value: { outcome: 'STORAGE_ERROR', transmissionAttempted: true } });
    const restarted = new BalanceInquiryService(g.journal, g.transport, runtime, provider());
    expect(
      await restarted.execute(request, target, { connect: 100, response: 100 }, async () => true),
    ).toMatchObject({ ok: true, value: { outcome: 'PENDING' } });
    expect(g.transport.exchange).toHaveBeenCalledTimes(1);
  });
  it('maneja excepción de transporte como entrega desconocida, sin reintentar', async () => {
    const target = balanceTarget();
    const f = fixture(provider());
    vi.mocked(f.transport.exchange).mockRejectedValue(Error('private-network-data'));
    const result = await f.service.execute(
      balanceRequest(target),
      target,
      { connect: 100, response: 100 },
      async () => true,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'TRANSPORT_ERROR', transmissionAttempted: true },
    });
    expect(JSON.stringify(result)).not.toContain('private-network-data');
  });
  it('rechaza payloads extra y un proveedor de estado que expone información no permitida', async () => {
    const target = balanceTarget();
    const f = fixture({
      ...provider(),
      inspect: async () => ({ ready: false, blockers: [{ id: 'SECRET', label: 'x'.repeat(201) }] }),
    });
    expect(await f.service.inspect(target)).toMatchObject({
      ready: false,
      blockers: [{ id: 'BALANCE-CONTEXT-UNAVAILABLE' }],
    });
    expect(
      await f.service.execute(
        { ...balanceRequest(target), pin: 'private' } as never,
        target,
        { connect: 100, response: 100 },
        async () => true,
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
});
