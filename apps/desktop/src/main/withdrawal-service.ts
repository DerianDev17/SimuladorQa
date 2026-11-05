import { FinancialExecutionService } from './financial-execution-service';
import { NewVisaWithdrawal } from './adapters/new-visa-withdrawal';
import type { BalanceContextProvider, BalanceJournal, BalanceTransport } from './balance-ports';
import type { RuntimeIdentity } from './ports';

// Reuse the single-write, durable idempotency and late-lease cleanup engine.
// No balance provider is installed here: withdrawal security needs its own contract.
export class WithdrawalService extends FinancialExecutionService {
  constructor(
    journal: BalanceJournal,
    transport: BalanceTransport,
    identity: RuntimeIdentity,
    context?: BalanceContextProvider,
    contextDeadlineMs = 90000,
  ) {
    super(
      journal,
      transport,
      identity,
      new NewVisaWithdrawal(),
      context,
      contextDeadlineMs,
      'WITHDRAWAL',
    );
  }
}
