import { isWithdrawalAmount } from '../../../../../packages/domain/src/withdrawal';
import { NewVisaBalance } from './new-visa-balance';
import type { NewBalanceInput, FinancialMessageBuilder } from '../financial-message-contract';

export interface NewWithdrawalInput extends NewBalanceInput {
  amount: string;
}

// F3/F4 and response fields follow PruebaSimulador frames 248/254 and ISOBASEI.
// The security provider must supply fresh, validated withdrawal EMV/PIN fields.
export class NewVisaWithdrawal implements FinancialMessageBuilder {
  build(input: NewBalanceInput) {
    if (!isWithdrawalAmount(input.amount)) throw Error('WITHDRAWAL_AMOUNT_INVALID');
    return new NewVisaBalance('WITHDRAWAL').build(input);
  }
}
