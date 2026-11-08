import { isWithdrawalAmount } from '../../../../../packages/domain/src/withdrawal';
import { NewVisaBalance } from './new-visa-balance';
import type { FinancialMessageBuilder, NewBalanceInput } from '../financial-message-contract';

// QA contract recorded in INPUT_CHECKLIST (2026-11-05), not a general host profile.
// Main supplies fresh deposit PIN/EMV; this adapter never derives private fields.
export class NewVisaDeposit implements FinancialMessageBuilder {
  build(input: NewBalanceInput) {
    if (!isWithdrawalAmount(input.amount)) throw Error('DEPOSIT_AMOUNT_INVALID');
    return new NewVisaBalance('DEPOSIT').build(input);
  }
}
