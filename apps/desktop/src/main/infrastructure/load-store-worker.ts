import { parentPort, workerData } from 'node:worker_threads';
import { SqliteLoadRunStore } from './sqlite-load-run-store';
import type {
  LoadStoreCommand,
  LoadStoreRequest,
  LoadStoreResponse,
  LoadStoreValue,
} from './load-store-protocol';

if (!parentPort) throw Error('LOAD_STORE_WORKER_UNAVAILABLE');
const port = parentPort;
const configuration = workerData as { file: string; legacy: string };
const store = new SqliteLoadRunStore(configuration.file, configuration.legacy);
async function execute(command: LoadStoreCommand): Promise<LoadStoreValue> {
  switch (command.kind) {
    case 'read':
      return store.read();
    case 'get':
      return store.get(command.id);
    case 'list':
      return store.list(command.query);
    case 'hasRequest':
      return store.hasRequest(command.id);
    case 'write':
      await store.write(command.run);
      return undefined;
    case 'close':
      await store.close();
      return undefined;
  }
}
// Keep the message order through validation, SQLite writes and graceful shutdown.
let pending = Promise.resolve();
port.on('message', (request: LoadStoreRequest) => {
  pending = pending.then(async () => {
    let response: LoadStoreResponse;
    try {
      response = { id: request.id, ok: true, value: await execute(request.command) };
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      response = {
        id: request.id,
        ok: false,
        code: ['LOAD_RUN_INVALID', 'LOAD_RUN_DUPLICATE_REQUEST', 'LOAD_HISTORY_INVALID'].includes(
          code,
        )
          ? code
          : 'LOAD_STORE_UNAVAILABLE',
      };
    }
    port.postMessage(response);
    if (request.command.kind === 'close') port.close();
  });
});
