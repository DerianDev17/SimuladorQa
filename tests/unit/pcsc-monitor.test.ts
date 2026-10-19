import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowsPcscMonitor } from '../../apps/desktop/src/main/adapters/windows-pcsc-monitor';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
class Helper extends EventEmitter {
  stdout = new PassThrough();
  kill = vi.fn(() => true);
  report(state: 'EMPTY' | 'CARD_PRESENT') {
    this.stdout.write(
      JSON.stringify({
        ok: true,
        readers: [{ name: 'CI Reader', state, atr: state === 'EMPTY' ? null : '3B00' }],
      }) + '\n',
    );
  }
}
describe('monitor pasivo PC/SC, proceso simulado sin hardware', () => {
  let helper: Helper;
  let monitor: WindowsPcscMonitor;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(spawn).mockReset();
    helper = new Helper();
    vi.mocked(spawn).mockReturnValue(helper as unknown as ReturnType<typeof spawn>);
    monitor = new WindowsPcscMonitor('synthetic.ps1', 8000, 'win32');
  });
  afterEach(() => {
    monitor.close();
    vi.useRealTimers();
  });
  it('detecta inserción/retiro y reutiliza el proceso sin consultas periódicas', async () => {
    const listener = vi.fn();
    const unsubscribe = monitor.subscribe(listener);
    const initial = monitor.inspect();
    helper.report('EMPTY');
    expect((await initial).readers[0]?.state).toBe('EMPTY');
    await vi.advanceTimersByTimeAsync(60000);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    helper.report('CARD_PRESENT');
    expect((await monitor.inspect()).readers[0]?.state).toBe('CARD_PRESENT');
    helper.report('EMPTY');
    expect((await monitor.inspect()).readers[0]?.atr).toBeNull();
    unsubscribe();
    helper.report('CARD_PRESENT');
    expect(listener).toHaveBeenCalledTimes(3);
  });
  it('rechaza salida inválida sin exponerla y recupera una dependencia caída', async () => {
    const listener = vi.fn();
    monitor.subscribe(listener);
    const initial = expect(monitor.inspect()).rejects.toThrow('PCSC_UNAVAILABLE');
    helper.stdout.write('PRIVATE DRIVER ERROR\n');
    await initial;
    expect(listener).toHaveBeenLastCalledWith(null);
    helper = new Helper();
    vi.mocked(spawn).mockReturnValue(helper as unknown as ReturnType<typeof spawn>);
    await vi.advanceTimersByTimeAsync(1000);
    helper.report('EMPTY');
    expect((await monitor.inspect()).readers).toHaveLength(1);
  });
  it('limita el arranque sin respuesta y cierra sin reiniciar helpers', async () => {
    const initial = expect(monitor.inspect()).rejects.toThrow('PCSC_TIMEOUT');
    await vi.advanceTimersByTimeAsync(8000);
    await initial;
    monitor.close();
    await vi.advanceTimersByTimeAsync(60000);
    expect(spawn).toHaveBeenCalledTimes(1);
    await expect(monitor.inspect()).rejects.toThrow('PCSC_UNAVAILABLE');
  });
  it('procesa líneas fragmentadas y no conserva referencias mutables del consumidor', async () => {
    const initial = monitor.inspect();
    helper.stdout.write('{"ok":true,"readers":');
    helper.stdout.write('[]}\n');
    const snapshot = await initial;
    snapshot.identityStatus = 'READ';
    expect((await monitor.inspect()).identityStatus).toBe('NOT_READ');
  });
});
