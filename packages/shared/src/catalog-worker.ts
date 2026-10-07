import type {
  CatalogSnapshot,
  DeleteRequest,
  SaveAtmRequest,
  SaveEntityRequest,
} from '../../domain/src/catalogs';
import type { Environment } from '../../domain/src/index';
import type { Result } from './contracts';

export type CatalogCommand =
  | { kind: 'list'; environment: Environment }
  | { kind: 'saveEntity'; request: SaveEntityRequest }
  | { kind: 'deleteEntity'; request: DeleteRequest }
  | { kind: 'saveAtm'; request: SaveAtmRequest }
  | { kind: 'deleteAtm'; request: DeleteRequest };
export interface CatalogContext {
  user: string;
  machine: string;
  timestamp: string;
}
export interface CatalogWorkerRequest {
  id: string;
  command: CatalogCommand;
  context: CatalogContext;
}
export interface CatalogWorkerResponse {
  id: string;
  result: Result<CatalogSnapshot>;
}
