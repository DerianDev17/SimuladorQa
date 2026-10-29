import type {
  BalanceContextRequest,
  BalanceReadiness,
  BalanceExecution,
  BalanceValue,
  BalanceDiagnostics,
} from '../../../../packages/domain/src/balance-inquiry';
import type { NewBalanceInput } from './adapters/new-visa-balance';
import type { CapturedBalanceMetadata } from './adapters/captured-visa-balance';
import type { ReversalProgress } from '../../../../packages/domain/src/withdrawal-reversal';
import type { IsoMessage } from '../../../../packages/domain/src/iso-message';

export interface BalanceTarget extends BalanceContextRequest {
  terminalId: string;
  endpoint: { host: string; port: number };
}
export interface BalanceContextLease extends NewBalanceInput {
  diagnostics?: BalanceDiagnostics;
  environment: 'QA';
  profileId: string;
  cardReadId: string;
  endpoint: { host: string; port: number };
  securitySource: 'GENERATED_TEST_SESSION';
  validUntil: string;
  validate?(): Promise<void>;
  release(): void;
}
// Provider must bind fresh test security, host calendar and reserved sequence to
// this card session/profile. A cancelled acquire must release any late lease.
export interface BalanceContextProvider {
  inspect(target: BalanceTarget): Promise<BalanceReadiness>;
  acquire(target: BalanceTarget, signal: AbortSignal): Promise<BalanceContextLease>;
}
export interface BalanceExchangeRequest {
  load?: { runId: string; concurrency: number; deadline?: number };
  onConnectionWait?: (elapsedMs: number) => void;
  onInterrupted?: (reason: 'CANCELLED' | 'DURATION') => void;
  withWrite?: (write: () => void) => Promise<void>;
  signal?: AbortSignal;
  environment: 'QA';
  endpoint: { host: string; port: number };
  wire: Uint8Array;
  expected: CapturedBalanceMetadata;
  connectDeadlineMs: number;
  responseDeadlineMs: number;
  reversal?: {
    delaySeconds: number;
    persist: (progress: ReversalProgress, original: BalanceExchangeResult) => Promise<void>;
  };
}
export interface BalanceExchangeResult {
  responseMessage?: IsoMessage;
  outcome:
    | 'APPROVED'
    | 'NOT_APPROVED'
    | 'REQUIRES_REVIEW'
    | 'INVALID_RESPONSE'
    | 'CONNECT_TIMEOUT'
    | 'RESPONSE_TIMEOUT'
    | 'PEER_CLOSED'
    | 'TRANSPORT_ERROR';
  transmissionAttempted: boolean;
  bytesQueued: number;
  elapsedMs: number;
  responseCode: string | null;
  balances: readonly BalanceValue[];
  reversal?: ReversalProgress;
}
export interface BalanceTransport {
  readonly supportsReversal?: true;
  exchange(request: BalanceExchangeRequest): Promise<BalanceExchangeResult>;
}
export interface BalanceJournal {
  read(): Promise<BalanceExecution[]>;
  recent?(limit: number): Promise<BalanceExecution[]>;
  write(executions: readonly BalanceExecution[]): Promise<void>;
}
