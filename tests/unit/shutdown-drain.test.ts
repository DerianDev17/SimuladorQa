import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainBeforeQuit } from '../../apps/desktop/src/main/shutdown-drain';

afterEach(() => vi.useRealTimers());

describe('cierre financiero acotado', () => {
  it('espera incluso si una dependencia termina con error', async () => {
    vi.useFakeTimers();
    const operation = new Promise<void>((resolve) => setTimeout(resolve, 20));
    const drain = drainBeforeQuit([operation, Promise.reject(Error('PRIVATE'))], 100);
    await vi.advanceTimersByTimeAsync(20);
    expect(await drain).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('vence sin quedar bloqueado por una dependencia que no responde', async () => {
    vi.useFakeTimers();
    const drain = drainBeforeQuit([new Promise<void>(() => undefined)], 20);
    await vi.advanceTimersByTimeAsync(20);
    expect(await drain).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
