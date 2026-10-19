import type {
  BalanceContextRequest,
  BalanceReadiness,
  BalanceExecution,
  BalanceValue,
  BalanceDiagnostics,
} from '../../../../packages/domain/src/balance-inquiry';
import type { NewBalanceInput } from './adapters/new-visa-balance';
import type { CapturedBalanceMetadata } from './adapters/captured-visa-balance';

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
  environment: 'QA';
  endpoint: { host: string; port: number };
  wire: Uint8Array;
  expected: CapturedBalanceMetadata;
  connectDeadlineMs: number;
  responseDeadlineMs: number;
}
export interface BalanceExchangeResult {
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
}
export interface BalanceTransport {
  exchange(request: BalanceExchangeRequest): Promise<BalanceExchangeResult>;
}
export interface BalanceJournal {
  read(): Promise<BalanceExecution[]>;
  write(executions: readonly BalanceExecution[]): Promise<void>;
}
