import { describe, expect, it, vi } from 'vitest';
import { IpcReadRequests } from '../../apps/desktop/src/ipc-read-requests';
import { channels } from '../../packages/shared/src/contracts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('lecturas IPC en curso', () => {
  it('permite recuperar una lectura vencida y su respuesta tardía no elimina la nueva', async () => {
    vi.useFakeTimers();
    try {
      const reads = new IpcReadRequests();
      const previous = deferred<string>();
      const latest = deferred<string>();
      const first = reads.run(channels.loadHistory, [], () => previous.promise);
      // Keep another key in the same channel map while the first key expires.
      await vi.advanceTimersByTimeAsync(1000);
      const other = reads.run(channels.loadHistory, ['other'], () => latest.promise);
      await vi.advanceTimersByTimeAsync(4000);
      const next = reads.run(channels.loadHistory, [], () => latest.promise);
      expect(next).not.toBe(first);
      previous.resolve('stale');
      expect(await first).toBe('stale');
      expect(reads.run(channels.loadHistory, [], async () => 'duplicate')).toBe(next);
      latest.resolve('current');
      expect(await next).toBe('current');
      await other;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('comparte argumentos equivalentes y vuelve a consultar después de terminar', async () => {
    const reads = new IpcReadRequests();
    const pending = deferred<string>();
    const invoke = vi.fn(() => pending.promise);
    const first = reads.run(channels.inspectQaAtm, [{ environment: 'QA', revision: 1 }], invoke);
    const second = reads.run(channels.inspectQaAtm, [{ revision: 1, environment: 'QA' }], invoke);
    expect(second).toBe(first);
    pending.resolve('inspection');
    expect(await Promise.all([first, second])).toEqual(['inspection', 'inspection']);
    expect(invoke).toHaveBeenCalledTimes(1);
    await reads.run(channels.inspectQaAtm, [{ environment: 'QA', revision: 1 }], invoke);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('separa canales, ambientes, revisiones, filtros y orden de listas', async () => {
    const reads = new IpcReadRequests();
    const invoke = vi.fn(async () => 'result');
    await Promise.all([
      reads.run(channels.catalog, [{ environment: 'QA' }], invoke),
      reads.run(channels.catalog, [{ environment: 'PROD' }], invoke),
      reads.run(channels.balanceHistory, [{ environment: 'QA' }], invoke),
      reads.run(channels.inspectQaAtm, [{ revision: 1 }], invoke),
      reads.run(channels.inspectQaAtm, [{ revision: 2 }], invoke),
      reads.run(channels.observations, [{ filters: ['a', 'b'] }], invoke),
      reads.run(channels.observations, [{ filters: ['b', 'a'] }], invoke),
    ]);
    expect(invoke).toHaveBeenCalledTimes(7);
  });

  it('no convierte entradas malformadas en claves de solicitudes válidas', async () => {
    const reads = new IpcReadRequests();
    const invoke = vi.fn(async () => 'validation');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const values = [undefined, NaN, Infinity, 1n, () => {}, circular, new Date(0)];
    await Promise.all(
      values.flatMap((value) => [
        reads.run(channels.catalog, [value], invoke),
        reads.run(channels.catalog, [value], invoke),
      ]),
    );
    expect(invoke).toHaveBeenCalledTimes(values.length * 2);
    const valid = reads.run(channels.inspectQaAtm, [{}], invoke);
    const invalid = reads.run(channels.inspectQaAtm, [{ extra: undefined }], invoke);
    expect(invalid).not.toBe(valid);
    await Promise.all([valid, invalid]);
  });

  it('libera la lectura tras un rechazo y permite recuperarse', async () => {
    const reads = new IpcReadRequests();
    const pending = deferred<string>();
    const invoke = vi.fn(() => pending.promise);
    const first = reads.run(channels.reader, [], invoke);
    const second = reads.run(channels.reader, [], invoke);
    const outcomes = Promise.allSettled([first, second]);
    pending.reject(Error('unavailable'));
    expect((await outcomes).map((item) => item.status)).toEqual(['rejected', 'rejected']);
    expect(invoke).toHaveBeenCalledTimes(1);
    await expect(reads.run(channels.reader, [], async () => 'recovered')).resolves.toBe(
      'recovered',
    );
  });

  it('libera también errores síncronos y resultados de validación fallida', async () => {
    const reads = new IpcReadRequests();
    await expect(
      reads.run(channels.catalog, [], () => {
        throw Error('unavailable');
      }),
    ).rejects.toThrow('unavailable');
    const invoke = vi.fn(async () => ({ ok: false, code: 'VALIDATION_ERROR' }));
    await reads.run(channels.catalog, [], invoke);
    await reads.run(channels.catalog, [], invoke);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('no comparte comandos financieros, de hardware ni canales nuevos', async () => {
    const reads = new IpcReadRequests();
    const invoke = vi.fn(async () => 'command');
    for (const channel of [channels.executeBalance, channels.readCardIdentity, 'future:command']) {
      await Promise.all([reads.run(channel, [], invoke), reads.run(channel, [], invoke)]);
    }
    expect(invoke).toHaveBeenCalledTimes(6);
  });

  it('invalida al iniciar y terminar comandos; una lectura antigua no borra la nueva', async () => {
    const reads = new IpcReadRequests();
    const old = deferred<string>();
    const command = deferred<string>();
    const during = deferred<string>();
    const latest = deferred<string>();
    const first = reads.run(channels.catalog, [], () => old.promise);
    const mutation = reads.run(channels.saveAtm, [], () => command.promise);
    const middle = reads.run(channels.catalog, [], () => during.promise);
    expect(middle).not.toBe(first);
    command.resolve('saved');
    await mutation;
    const current = reads.run(channels.catalog, [], () => latest.promise);
    old.resolve('old');
    during.resolve('during');
    await Promise.all([first, middle]);
    expect(reads.run(channels.catalog, [], async () => 'duplicate')).toBe(current);
    latest.resolve('new');
    expect(await current).toBe('new');
  });

  it('invalida también tras un comando fallido', async () => {
    const reads = new IpcReadRequests();
    const command = deferred<string>();
    const pending = deferred<string>();
    const mutation = reads.run(channels.saveAtm, [], () => command.promise);
    const first = reads.run(channels.catalog, [], () => pending.promise);
    const failure = expect(mutation).rejects.toThrow('failed');
    command.reject(Error('failed'));
    await failure;
    const second = reads.run(channels.catalog, [], async () => 'fresh');
    expect(second).not.toBe(first);
    pending.resolve('stale');
    await Promise.all([first, second]);
  });

  it('los eventos del lector invalidan solo su consulta pendiente', async () => {
    const reads = new IpcReadRequests();
    const pending = deferred<string>();
    const catalog = reads.run(channels.catalog, [], () => pending.promise);
    const reader = reads.run(channels.reader, [], () => pending.promise);
    reads.invalidate(channels.reader);
    const next = reads.run(channels.reader, [], () => pending.promise);
    expect(next).not.toBe(reader);
    expect(reads.run(channels.catalog, [], async () => 'duplicate')).toBe(catalog);
    pending.resolve('result');
    await Promise.all([catalog, reader, next]);
  });
});
