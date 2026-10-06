import type {
  DataBlocker,
  Environment,
  Preparation,
  PreparationRequest,
} from '../../domain/src/index';

export const channels = {
  snapshot: 'app:snapshot',
  environment: 'app:environment',
  prepare: 'app:prepare',
} as const;

export type ErrorCode =
  'VALIDATION_ERROR' | 'STORAGE_UNAVAILABLE' | 'SERVICE_UNAVAILABLE' | 'TIMEOUT' | 'FORBIDDEN';
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
}

export interface DesktopApi {
  getSnapshot(): Promise<Result<AppSnapshot>>;
  setEnvironment(environment: Environment): Promise<Result<AppSnapshot>>;
  prepareTransaction(request: PreparationRequest): Promise<Result<Preparation>>;
}

export function failure(code: ErrorCode, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}
