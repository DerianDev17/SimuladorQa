import { BalanceInquiryService } from './balance-inquiry-service';
import type { BalanceContextProvider, BalanceJournal, BalanceTransport } from './balance-ports';
import type { RuntimeIdentity } from './ports';

// Reuse the single-write, durable idempotency and late-lease cleanup engine.
// No balance provider is installed here: withdrawal security needs its own contract.
export class WithdrawalService extends BalanceInquiryService {
  constructor(
    journal: BalanceJournal,
    transport: BalanceTransport,
    identity: RuntimeIdentity,
    context?: BalanceContextProvider,
    contextDeadlineMs = 90000,
  ) {
    super(journal, transport, identity, context, contextDeadlineMs, 'WITHDRAWAL');
  }
}
