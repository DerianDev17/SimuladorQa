import type { IpcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { LoadRunService } from '../../apps/desktop/src/main/load-run-service';
import { FileLoadRunStore } from '../../apps/desktop/src/main/infrastructure/load-run-store';
import { workerLoadScheduler } from '../../apps/desktop/src/main/infrastructure/load-scheduler';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';

export function install(ipc: IpcMain, file: string, worker: string, sample: BalanceExecution) {
  const runtime = {
    agentId: randomUUID(),
    hostname: 'test',
    user: 'test',
    version: 'test',
    uuid: randomUUID,
    now: () => new Date().toISOString(),
  };
  const service = new LoadRunService(
    runtime,
    {
      prepare: async () => ({
        ok: true,
        value: {
          readerName: 'Synthetic reader',
          close: () => {},
          execute: async (signal, runId) => {
            await new Promise<void>((resolve) => {
              const timer = setTimeout(() => {
                signal.removeEventListener('abort', cancel);
                resolve();
              }, 300);
              const cancel = () => {
                clearTimeout(timer);
                resolve();
              };
              signal.addEventListener('abort', cancel, { once: true });
            });
            return signal.aborted
              ? { ok: false, error: { code: 'CONFLICT', message: 'Detenida por el operador.' } }
              : {
                  ok: true,
                  value: {
                    ...sample,
                    requestId: randomUUID(),
                    transactionId: randomUUID(),
                    runId,
                    loadTimings: {
                      cardReadMs: 10,
                      inspectMs: 5,
                      contextMs: 10,
                      validationMs: 5,
                      journalMs: 5,
                      transportMs: 250,
                      otherMs: 15,
                      totalMs: 300,
                    },
                  },
                };
          },
        },
      }),
    },
    new FileLoadRunStore(file),
    workerLoadScheduler(worker),
  );
  for (const channel of ['load:run:start', 'load:run:status', 'load:run:stop'])
    ipc.removeHandler(channel);
  ipc.handle('load:run:start', (_event, payload: unknown) => service.start(payload));
  ipc.handle('load:run:status', () => service.current(undefined));
  ipc.handle('load:run:stop', (_event, payload: unknown) => service.stop(payload));
}
