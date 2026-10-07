import { parentPort, workerData } from 'node:worker_threads';
import { SqliteCatalog } from './sqlite-catalog';
import type {
  CatalogWorkerRequest,
  CatalogWorkerResponse,
} from '../../../../../packages/shared/src/catalog-worker';

if (!parentPort) throw new Error('CATALOG_WORKER_UNAVAILABLE');
const configuration = workerData as { file: string };
const catalog = new SqliteCatalog(configuration.file);
parentPort.on('message', (request: CatalogWorkerRequest) => {
  const response: CatalogWorkerResponse = {
    id: request.id,
    result: catalog.execute(request.command, request.context),
  };
  parentPort?.postMessage(response);
});
parentPort.on('close', () => catalog.close());
