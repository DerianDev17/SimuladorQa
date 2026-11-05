import { FinancialExecutionService } from './financial-execution-service';
import { NewVisaBalance } from './adapters/new-visa-balance';
import type { BalanceContextProvider, BalanceJournal, BalanceTransport } from './balance-ports';
import type { RuntimeIdentity } from './ports';

// Composition facade: preserve the balance API while the shared engine owns execution.
export class BalanceInquiryService extends FinancialExecutionService {
  constructor(
    journal: BalanceJournal,
    transport: BalanceTransport,
    identity: RuntimeIdentity,
    context?: BalanceContextProvider,
    contextDeadlineMs = 5000,
  ) {
    super(
      journal,
      transport,
      identity,
      new NewVisaBalance(),
      context,
      contextDeadlineMs,
      'BALANCE',
    );
  }
}
