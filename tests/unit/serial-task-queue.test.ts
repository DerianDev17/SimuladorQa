import { describe, expect, it, vi } from 'vitest';
import { SerialTaskQueue } from '../../apps/desktop/src/main/serial-task-queue';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('cola serial por propietario', () => {
  it('conserva FIFO y resultados sin solapar tareas pendientes', async () => {
    const queue = new SerialTaskQueue();
    const started = gate();
    const blocked = gate();
    const events: string[] = [];
    const first = queue.run(async () => {
      events.push('first:start');
      started.release();
      await blocked.promise;
      events.push('first:end');
      return 42;
    });
    const second = queue.run(async () => {
      events.push('second');
      return 'done';
    });
    const third = queue.run(async () => {
      events.push('third');
      return null;
    });
    await started.promise;
    expect(events).toEqual(['first:start']);
    blocked.release();
    expect(await Promise.all([first, second, third])).toEqual([42, 'done', null]);
    expect(events).toEqual(['first:start', 'first:end', 'second', 'third']);
  });

  it.each(['throw', 'reject'] as const)(
    'propaga %s sin reintentar ni bloquear el trabajo ya encolado',
    async (kind) => {
      const queue = new SerialTaskQueue();
      const error = new Error('DEPENDENCY_UNAVAILABLE');
      const operation = vi.fn(() => {
        if (kind === 'throw') throw error;
        return Promise.reject(error);
      });
      const failed = queue.run(operation);
      const next = queue.run(async () => 'recovered');
      await expect(failed).rejects.toBe(error);
      await expect(next).resolves.toBe('recovered');
      expect(operation).toHaveBeenCalledTimes(1);
    },
  );

  it('una dependencia pendiente no bloquea colas de otros propietarios', async () => {
    const blocked = gate();
    const first = new SerialTaskQueue().run(() => blocked.promise);
    await expect(new SerialTaskQueue().run(async () => 'independent')).resolves.toBe('independent');
    blocked.release();
    await first;
  });

  it('un timeout del consumidor no libera la exclusión de una tarea todavía activa', async () => {
    vi.useFakeTimers();
    const queue = new SerialTaskQueue();
    const blocked = gate();
    const active = queue.run(() => blocked.promise);
    const operation = vi.fn(async () => 'next');
    const next = queue.run(operation);
    try {
      const waiting = Promise.race([
        active,
        new Promise<string>((resolve) => setTimeout(() => resolve('TIMEOUT'), 50)),
      ]);
      await vi.advanceTimersByTimeAsync(50);
      await expect(waiting).resolves.toBe('TIMEOUT');
      expect(operation).not.toHaveBeenCalled();
    } finally {
      blocked.release();
      await active;
      await next;
      vi.useRealTimers();
    }
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
