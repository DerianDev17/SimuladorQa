import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopClient } from '../../apps/desktop/src/renderer/desktop-client';
import { channels, desktopEvents, type DesktopApi } from '../../packages/shared/src/contracts';

const bridge = vi.hoisted(() => ({
  expose: vi.fn<(name: string, api: DesktopApi) => void>(),
  invoke: vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: bridge.expose },
  ipcRenderer: { invoke: bridge.invoke, on: bridge.on, removeListener: bridge.removeListener },
}));

describe('preload y consumidores de lecturas', () => {
  let api: DesktopApi;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    bridge.invoke.mockReset();
    await import('../../apps/desktop/src/preload');
    api = bridge.expose.mock.calls[0]![1];
  });
  afterEach(() => vi.useRealTimers());

  it('comparte consultas entre clientes y mantiene una nueva lectura tras completar', async () => {
    bridge.invoke.mockResolvedValue({ ok: true, value: [] });
    const first = new DesktopClient(api);
    const second = new DesktopClient(api);
    const results = await Promise.all([
      first.call((service) => service.getBalanceHistory('QA')),
      second.call((service) => service.getBalanceHistory('QA')),
    ]);
    expect(bridge.invoke).toHaveBeenCalledTimes(1);
    expect(bridge.invoke).toHaveBeenCalledWith(channels.balanceHistory, { environment: 'QA' });
    expect(results).toEqual([
      { ok: true, value: [] },
      { ok: true, value: [] },
    ]);
    await first.call((service) => service.getBalanceHistory('QA'));
    expect(bridge.invoke).toHaveBeenCalledTimes(2);
  });

  it('un timeout del consumidor no vuelve a enviar el IPC que aún está pendiente', async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    bridge.invoke.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const client = new DesktopClient(api, 20);
    const first = client.call((service) => service.getCatalog('QA'));
    await vi.advanceTimersByTimeAsync(20);
    expect(await first).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    const second = client.call((service) => service.getCatalog('QA'));
    await vi.advanceTimersByTimeAsync(1);
    expect(bridge.invoke).toHaveBeenCalledTimes(1);
    resolve({ ok: true, value: { environment: 'QA', entities: [], atms: [] } });
    expect(await second).toMatchObject({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
    bridge.invoke.mockResolvedValue({ ok: true, value: [] });
    await client.call((service) => service.getCatalog('QA'));
    expect(bridge.invoke).toHaveBeenCalledTimes(2);
  });

  it('sanitiza errores para todos los consumidores y deja reintentar la lectura', async () => {
    bridge.invoke.mockRejectedValue(Error('private-secret'));
    const client = new DesktopClient(api);
    const results = await Promise.all([
      client.call((service) => service.getSnapshot()),
      client.call((service) => service.getSnapshot()),
    ]);
    expect(bridge.invoke).toHaveBeenCalledTimes(1);
    for (const result of results)
      expect(result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(JSON.stringify(results)).not.toContain('private-secret');
    bridge.invoke.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid' },
    });
    expect(await client.call((service) => service.getSnapshot())).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(bridge.invoke).toHaveBeenCalledTimes(2);
  });

  it('Actualizar historial puede consultar de nuevo después del timeout del Renderer', async () => {
    vi.useFakeTimers();
    let finishPrevious!: (value: unknown) => void;
    bridge.invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPrevious = resolve;
        }),
    );
    const client = new DesktopClient(api);
    const first = client.call((service) => service.listLoadHistory({}));
    await vi.advanceTimersByTimeAsync(5000);
    expect(await first).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    const current = { ok: true, value: { entries: [], next: null } };
    bridge.invoke.mockResolvedValue(current);
    expect(await client.call((service) => service.listLoadHistory({}))).toEqual(current);
    expect(bridge.invoke).toHaveBeenCalledTimes(2);
    finishPrevious({
      ok: false,
      error: { code: 'TIMEOUT', message: 'Consulta anterior vencida.' },
    });
    await Promise.resolve();
  });

  it('una visita nueva de Inicio no hereda el feed pendiente de la visita anterior', async () => {
    let finishPrevious!: (value: unknown) => void;
    bridge.invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPrevious = resolve;
        }),
    );
    const current = { ok: true, value: { rows: [{ traceId: 'CURRENT' }] } };
    bridge.invoke.mockResolvedValue(current);
    const request = {
      mode: 'live',
      environment: 'QA',
      entityId: 205,
      channelId: 1,
      limit: 50,
    } as const;
    const previous = api.getMediatorLive(request);
    const next = api.getMediatorLive(request);
    expect(bridge.invoke).toHaveBeenCalledTimes(2);
    expect(await next).toEqual(current);
    finishPrevious({
      ok: false,
      error: { code: 'TIMEOUT', message: 'Consulta anterior vencida.' },
    });
    expect(await previous).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(await next).toEqual(current);
  });

  it('los eventos de hardware evitan reutilizar un estado anterior a la retirada', async () => {
    const completions: ((value: unknown) => void)[] = [];
    bridge.invoke.mockImplementation(() => new Promise((done) => completions.push(done)));
    const unsubscribe = api.onReaderSnapshot(vi.fn());
    const first = api.getReaderSnapshot();
    await Promise.resolve();
    const receive = bridge.on.mock.calls[0]![1] as (event: unknown, result: unknown) => void;
    receive({}, { ok: true, value: { readers: [] } });
    const second = api.getReaderSnapshot();
    await Promise.resolve();
    expect(bridge.invoke).toHaveBeenCalledTimes(2);
    for (const resolve of completions) resolve({ ok: true, value: { readers: [] } });
    await Promise.all([first, second]);
    unsubscribe();
    expect(bridge.removeListener).toHaveBeenCalledWith(desktopEvents.readerChanged, receive);
  });
});
