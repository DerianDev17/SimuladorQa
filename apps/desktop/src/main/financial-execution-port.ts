import type {
  BalanceExecution,
  BalanceExecutionRequest,
  BalanceReadiness,
} from '../../../../packages/domain/src/balance-inquiry';
import type { Result } from '../../../../packages/shared/src/contracts';
import type { BalanceTarget } from './balance-ports';
import type { BalanceExecutionContext } from './financial-execution-context';

// Application-facing contract. Implementations own idempotency and their journal.
export interface FinancialExecutionPort {
  isBusy(): boolean;
  inspect(target: BalanceTarget): Promise<BalanceReadiness>;
  execute(
    request: BalanceExecutionRequest,
    target: BalanceTarget,
    deadlines: { connect: number; response: number },
    revalidate: () => Promise<boolean>,
    execution?: BalanceExecutionContext,
  ): Promise<Result<BalanceExecution>>;
  find(requestId: string): Promise<Result<BalanceExecution | null>>;
  history(): Promise<Result<readonly BalanceExecution[]>>;
}
