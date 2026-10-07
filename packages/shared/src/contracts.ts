import type {
  DataBlocker,
  Environment,
  Preparation,
  PreparationRequest,
} from '../../domain/src/index';
import type {
  CatalogSnapshot,
  DeleteRequest,
  SaveAtmRequest,
  SaveEntityRequest,
} from '../../domain/src/catalogs';
import type {
  DocumentedOperation,
  DraftRequest,
  DraftReview,
} from '../../domain/src/transaction-draft';

export const channels = {
  snapshot: 'app:snapshot',
  environment: 'app:environment',
  prepare: 'app:prepare',
  reviewDraft: 'transaction:draft:review',
  catalog: 'catalog:list',
  saveEntity: 'catalog:entity:save',
  deleteEntity: 'catalog:entity:delete',
  saveAtm: 'catalog:atm:save',
  deleteAtm: 'catalog:atm:delete',
} as const;

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'STORAGE_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'IN_USE';
export type Result<T> =
  { ok: true; value: T } | { ok: false; error: { code: ErrorCode; message: string } };

export interface EnvironmentAudit {
  id: string;
  timestamp: string;
  environment: Environment;
  previousEnvironment: Environment;
  user: string;
  machine: string;
}

export interface AppSnapshot {
  version: string;
  agentId: string;
  hostname: string;
  environment: Environment;
  storage: 'AVAILABLE';
  reader: 'NOT_CONFIGURED';
  connection: 'NOT_CONFIGURED';
  controlPlane: 'NOT_CONFIGURED';
  blockers: readonly DataBlocker[];
  audit: readonly EnvironmentAudit[];
  documentedOperations: readonly DocumentedOperation[];
}

export interface DesktopApi {
  getSnapshot(): Promise<Result<AppSnapshot>>;
  setEnvironment(environment: Environment): Promise<Result<AppSnapshot>>;
  prepareTransaction(request: PreparationRequest): Promise<Result<Preparation>>;
  reviewDraft(request: DraftRequest): Promise<Result<DraftReview>>;
  getCatalog(environment: Environment): Promise<Result<CatalogSnapshot>>;
  saveEntity(request: SaveEntityRequest): Promise<Result<CatalogSnapshot>>;
  deleteEntity(request: DeleteRequest): Promise<Result<CatalogSnapshot>>;
  saveAtm(request: SaveAtmRequest): Promise<Result<CatalogSnapshot>>;
  deleteAtm(request: DeleteRequest): Promise<Result<CatalogSnapshot>>;
}

export function failure(code: ErrorCode, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}
