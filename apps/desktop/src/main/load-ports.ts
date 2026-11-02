import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type {
  LoadRunRequest,
  LoadRunSnapshot,
  LoadRunTimings,
} from '../../../../packages/domain/src/load-run';
import type { Result } from '../../../../packages/shared/src/contracts';
import type {
  CardIdentityReading,
  CardIdentityRequest,
} from '../../../../packages/domain/src/card-reader';
import type {
  BalanceContextRequest,
  BalanceExecutionRequest,
  BalanceReadiness,
} from '../../../../packages/domain/src/balance-inquiry';
import type { SendConfigurationSnapshot } from '../../../../packages/domain/src/send-configuration';
import type { LoadTestOperation } from '../../../../packages/domain/src/load-test';
import type { BalanceExecutionContext } from './financial-execution-context';

export interface LoadCardReader {
  current(): Promise<CardIdentityReading | null>;
  read(request: CardIdentityRequest): Promise<Result<CardIdentityReading>>;
  beginLoadSession?(): void;
  endLoadSession?(): void;
}

// The load driver controls lifetime only; it never reads the session PIN.
export interface LoadSessionResource {
  begin(): void;
  end(): void;
}

export interface LoadFinancialOperations {
  getSendConfiguration(request: { environment: 'QA' }): Promise<Result<SendConfigurationSnapshot>>;
  getBalanceReadiness(
    request: BalanceContextRequest,
    operation?: LoadTestOperation,
  ): Promise<Result<BalanceReadiness>>;
  executeBalance(
    request: BalanceExecutionRequest,
    operation?: LoadTestOperation,
    execution?: BalanceExecutionContext,
  ): Promise<Result<BalanceExecution>>;
}

export type LoadExecutionResult = Result<BalanceExecution & { loadTimings?: LoadRunTimings }> & {
  skipped?: 'DURATION';
  cancelled?: true;
};
export interface LoadRunSource {
  readerName: string;
  execute(
    signal: AbortSignal,
    runId: string,
    slot?: { index: number; deadline: number },
  ): Promise<LoadExecutionResult>;
  close(): void;
}
export interface LoadRunDriver {
  prepare(request: LoadRunRequest): Promise<Result<LoadRunSource>>;
}
export interface LoadRunStore {
  read(): Promise<LoadRunSnapshot | null>;
  hasRequest(id: string): Promise<boolean>;
  write(snapshot: LoadRunSnapshot): Promise<void>;
}
export interface LoadSchedule {
  started?(operationStartedAt: number, ticket?: number): void;
  next(operationStartedAt?: number, ticket?: number): void;
  stop(): void;
}
export type LoadScheduler = (
  request: LoadRunRequest,
  tick: (ticket?: number) => void,
  done: (reason: 'COUNT' | 'DURATION' | 'STOP' | 'ERROR') => void,
  startedAt?: number,
) => LoadSchedule;
