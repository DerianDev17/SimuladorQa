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
import type { CaptureEvidence } from '../../domain/src/capture-evidence';
import type { SaveCaseRequest } from '../../domain/src/saved-cases';
import type { ObservationRequest, ObservationSearch } from '../../domain/src/observations';
import type { LoadTestDraft, LoadTestPlan } from '../../domain/src/load-test';
import type { NetworkEvidenceSnapshot } from '../../domain/src/network-evidence';
import type { SwitchConnectionSnapshot } from '../../domain/src/switch-connection';
import type {
  CardIdentityReading,
  CardIdentityRequest,
  CardReaderSnapshot,
} from '../../domain/src/card-reader';
import type {
  VirtualCardFixture,
  VirtualCardGenerationRequest,
} from '../../domain/src/virtual-card-fixtures';
import type {
  DeleteCardProfileRequest,
  SaveCardProfileRequest,
  SavedCardProfile,
} from '../../domain/src/saved-card-profiles';

import type {
  SaveSendConfigurationRequest,
  SendConfigurationSnapshot,
  SendTrigger,
} from '../../domain/src/send-configuration';
import type {
  BalanceContextRequest,
  BalanceExecutionRequest,
  BalanceExecution,
  BalanceReadiness,
} from '../../domain/src/balance-inquiry';
import type {
  ReceiptPrintStatus,
  WithdrawalReceiptRequest,
} from '../../domain/src/withdrawal-receipt';

export const channels = {
  snapshot: 'app:snapshot',
  switchConnection: 'switch:connection:status',
  connectSwitch: 'switch:connection:connect',
  disconnectSwitch: 'switch:connection:disconnect',
  reader: 'reader:inspect',
  readCardIdentity: 'reader:identity:read',
  generateVirtualCardFixtures: 'reader:virtual-fixtures:generate',
  listSavedCardProfiles: 'reader:profiles:list',
  saveCardProfile: 'reader:profiles:save',
  deleteCardProfile: 'reader:profiles:delete',
  environment: 'app:environment',
  prepare: 'app:prepare',
  reviewDraft: 'transaction:draft:review',
  sendConfiguration: 'transaction:send:configuration',
  saveSendConfiguration: 'transaction:send:configure',
  prepareSendPlan: 'transaction:send:prepare',
  balanceReadiness: 'transaction:balance:readiness',
  executeBalance: 'transaction:balance:execute',
  balanceExecution: 'transaction:balance:result',
  balanceHistory: 'transaction:balance:history',
  withdrawalReadiness: 'transaction:withdrawal:readiness',
  executeWithdrawal: 'transaction:withdrawal:execute',
  withdrawalExecution: 'transaction:withdrawal:result',
  withdrawalHistory: 'transaction:withdrawal:history',
  printWithdrawalReceipt: 'transaction:withdrawal:receipt:print',
  catalog: 'catalog:list',
  saveEntity: 'catalog:entity:save',
  deleteEntity: 'catalog:entity:delete',
  saveAtm: 'catalog:atm:save',
  deleteAtm: 'catalog:atm:delete',
  saveCase: 'catalog:case:save',
  deleteCase: 'catalog:case:delete',
  observations: 'observations:search',
  prepareLoadTest: 'load:plan:prepare',
} as const;

// Main -> Renderer only. These are not callable command channels.
export const desktopEvents = { readerChanged: 'reader:changed' } as const;

export type ErrorCode =
  | 'TLS_ERROR'
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
  reader: 'NOT_CONFIGURED' | 'CONFIGURED';
  connection: 'NOT_CONFIGURED' | SwitchConnectionSnapshot['state'];
  controlPlane: 'NOT_CONFIGURED';
  blockers: readonly DataBlocker[];
  audit: readonly EnvironmentAudit[];
  documentedOperations: readonly DocumentedOperation[];
  captureEvidence: CaptureEvidence | null;
  networkEvidence: NetworkEvidenceSnapshot;
}

export interface ReviewedDraft extends DraftReview {
  reviewId: string;
  reviewedAt: string;
}

export interface SendPlanRequest {
  draft: DraftRequest;
  configurationRevision: number;
}
export interface PreparedSendPlan {
  planId: string;
  plannedAt: string;
  review: ReviewedDraft;
  configurationRevision: number;
  trigger: SendTrigger;
  endpoint: { host: string; port: number };
  status: 'BLOCKED';
  blockers: readonly { id: string; label: string }[];
  frameGenerated: false;
  transmissionAttempted: false;
}

export interface DesktopApi {
  getSnapshot(): Promise<Result<AppSnapshot>>;
  getSwitchConnection(environment: Environment): Promise<Result<SwitchConnectionSnapshot>>;
  connectSwitch(environment: Environment): Promise<Result<SwitchConnectionSnapshot>>;
  disconnectSwitch(environment: Environment): Promise<Result<SwitchConnectionSnapshot>>;
  getSendConfiguration(environment: Environment): Promise<Result<SendConfigurationSnapshot>>;
  saveSendConfiguration(
    request: SaveSendConfigurationRequest,
  ): Promise<Result<SendConfigurationSnapshot>>;
  prepareSendPlan(request: SendPlanRequest): Promise<Result<PreparedSendPlan>>;
  getBalanceReadiness(request: BalanceContextRequest): Promise<Result<BalanceReadiness>>;
  executeBalance(request: BalanceExecutionRequest): Promise<Result<BalanceExecution>>;
  getBalanceExecution(request: {
    environment: 'QA';
    requestId: string;
  }): Promise<Result<BalanceExecution | null>>;
  getBalanceHistory(environment: 'QA'): Promise<Result<readonly BalanceExecution[]>>;
  getWithdrawalReadiness(request: BalanceContextRequest): Promise<Result<BalanceReadiness>>;
  executeWithdrawal(request: BalanceExecutionRequest): Promise<Result<BalanceExecution>>;
  getWithdrawalExecution(request: {
    environment: 'QA';
    requestId: string;
  }): Promise<Result<BalanceExecution | null>>;
  getWithdrawalHistory(environment: 'QA'): Promise<Result<readonly BalanceExecution[]>>;
  printWithdrawalReceipt(request: WithdrawalReceiptRequest): Promise<Result<ReceiptPrintStatus>>;
  getReaderSnapshot(): Promise<Result<CardReaderSnapshot>>;
  onReaderSnapshot(listener: (result: Result<CardReaderSnapshot>) => void): () => void;
  readCardIdentity(request: CardIdentityRequest): Promise<Result<CardIdentityReading>>;
  generateVirtualCardFixtures(
    request: VirtualCardGenerationRequest,
  ): Promise<Result<VirtualCardFixture[]>>;
  listSavedCardProfiles(): Promise<Result<readonly SavedCardProfile[]>>;
  saveCardProfile(request: SaveCardProfileRequest): Promise<Result<readonly SavedCardProfile[]>>;
  deleteCardProfile(
    request: DeleteCardProfileRequest,
  ): Promise<Result<readonly SavedCardProfile[]>>;
  setEnvironment(environment: Environment): Promise<Result<AppSnapshot>>;
  prepareTransaction(request: PreparationRequest): Promise<Result<Preparation>>;
  reviewDraft(request: DraftRequest): Promise<Result<ReviewedDraft>>;
  getCatalog(environment: Environment): Promise<Result<CatalogSnapshot>>;
  saveEntity(request: SaveEntityRequest): Promise<Result<CatalogSnapshot>>;
  deleteEntity(request: DeleteRequest): Promise<Result<CatalogSnapshot>>;
  saveAtm(request: SaveAtmRequest): Promise<Result<CatalogSnapshot>>;
  deleteAtm(request: DeleteRequest): Promise<Result<CatalogSnapshot>>;
  saveCase(request: SaveCaseRequest): Promise<Result<CatalogSnapshot>>;
  deleteCase(request: DeleteRequest): Promise<Result<CatalogSnapshot>>;
  searchObservations(request: ObservationRequest): Promise<Result<ObservationSearch>>;
  prepareLoadTest(request: LoadTestDraft): Promise<Result<LoadTestPlan>>;
}

export function failure(code: ErrorCode, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}
