import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopClient } from '../../apps/desktop/src/renderer/desktop-client';
import type { DesktopApi } from '../../packages/shared/src/contracts';

describe('puente desktop', () => {
  afterEach(() => vi.useRealTimers());
  it('informa que Electron no está disponible en un navegador', async () => {
    const result = await new DesktopClient(undefined).call((api) => api.getSnapshot());
    expect(result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
  });
  it('entrega el resultado del servicio', async () => {
    const client = new DesktopClient({} as DesktopApi);
    expect(await client.call(async () => ({ ok: true, value: 'verified' }))).toEqual({
      ok: true,
      value: 'verified',
    });
  });
  it('sanitiza un rechazo del servicio', async () => {
    const result = await new DesktopClient({} as DesktopApi).call(() =>
      Promise.reject(new Error('private-secret')),
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });
  it('limita la espera y limpia el timer cuando la dependencia no responde', async () => {
    vi.useFakeTimers();
    const promise = new DesktopClient({} as DesktopApi, 100).call(
      () => new Promise(() => undefined),
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(await promise).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('limpia el timer cuando el servicio responde', async () => {
    vi.useFakeTimers();
    await new DesktopClient({} as DesktopApi).call(async () => ({ ok: true, value: 1 }));
    expect(vi.getTimerCount()).toBe(0);
  });
});
