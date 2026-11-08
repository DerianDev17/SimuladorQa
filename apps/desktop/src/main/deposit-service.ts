import { FinancialExecutionService } from './financial-execution-service';
import { NewVisaDeposit } from './adapters/new-visa-deposit';
import type { BalanceContextProvider, BalanceJournal, BalanceTransport } from './balance-ports';
import type { RuntimeIdentity } from './ports';
import type { SessionMessagePort } from './session-message-port';

export class DepositService extends FinancialExecutionService {
  constructor(
    journal: BalanceJournal,
    transport: BalanceTransport,
    identity: RuntimeIdentity,
    context?: BalanceContextProvider,
    contextDeadlineMs = 90000,
    sessionMessages?: SessionMessagePort,
  ) {
    super(
      journal,
      transport,
      identity,
      new NewVisaDeposit(),
      context,
      contextDeadlineMs,
      'DEPOSIT',
      sessionMessages,
    );
  }
}
