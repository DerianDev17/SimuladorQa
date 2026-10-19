import { isWithdrawalAmount } from '../../../../../packages/domain/src/withdrawal';
import { NewVisaBalance, type NewBalanceInput } from './new-visa-balance';

export interface NewWithdrawalInput extends NewBalanceInput {
  amount: string;
}

// F3/F4 and response fields follow PruebaSimulador frames 248/254 and ISOBASEI.
// The security provider must supply fresh, validated withdrawal EMV/PIN fields.
export class NewVisaWithdrawal {
  build(input: NewWithdrawalInput) {
    if (!isWithdrawalAmount(input.amount)) throw Error('WITHDRAWAL_AMOUNT_INVALID');
    return new NewVisaBalance('WITHDRAWAL').build(input);
  }
}
