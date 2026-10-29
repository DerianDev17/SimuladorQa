import { Buffer } from 'node:buffer';
import { balanceDynamicFields } from './coonecta-balance-rules';
import type { BalanceDynamicInput } from './coonecta-balance-rules';
import { CapturedVisaBalance } from './captured-visa-balance';
import type { CapturedBalanceMetadata } from './captured-visa-balance';
import { CapturedVisaFraming } from '../infrastructure/captured-visa-framing';
import { isWithdrawalAmount } from '../../../../../packages/domain/src/withdrawal';
import type { IsoMessage } from '../../../../../packages/domain/src/iso-message';

const fields = [
  2, 3, 4, 7, 11, 12, 13, 14, 15, 18, 19, 22, 23, 25, 28, 32, 35, 37, 41, 42, 43, 48, 49, 52, 53,
  55, 60, 62,
];
const dynamic = new Set([3, 4, 7, 11, 12, 13, 15, 37, 41]);
function ebcdic(text: string): Buffer {
  return Buffer.from(
    [...text].map((letter) => {
      if (/\d/.test(letter)) return 0xf0 + Number(letter);
      const code = letter.charCodeAt(0);
      if (code >= 65 && code <= 73) return 0xc1 + code - 65;
      if (code >= 74 && code <= 82) return 0xd1 + code - 74;
      if (code >= 83 && code <= 90) return 0xe2 + code - 83;
      throw new Error('BALANCE_TERMINAL_INVALID');
    }),
  );
}
export interface NewBalanceInput extends BalanceDynamicInput {
  header: Uint8Array;
  extension: Uint8Array;
  // Fresh, provider-generated encoded fields; never sourced from a replay/Renderer.
  privateFields: ReadonlyMap<number, Uint8Array>;
  amount?: string;
}
export class NewVisaBalance {
  constructor(private readonly operation: 'BALANCE' | 'WITHDRAWAL' = 'BALANCE') {}
  build(input: NewBalanceInput): {
    wire: Buffer;
    metadata: CapturedBalanceMetadata;
    message: IsoMessage;
  } {
    if (
      input.account !== 'SAVINGS' ||
      input.header.length !== 22 ||
      input.header[0] !== 22 ||
      input.extension.length !== 2 ||
      input.privateFields.size !== fields.filter((field) => !dynamic.has(field)).length ||
      [...input.privateFields.keys()].some((field) => !fields.includes(field) || dynamic.has(field))
    )
      throw new Error('BALANCE_PROFILE_INVALID');
    if (
      this.operation === 'WITHDRAWAL'
        ? !isWithdrawalAmount(input.amount)
        : input.amount !== undefined
    )
      throw Error('WITHDRAWAL_AMOUNT_INVALID');
    const generated = new Map(balanceDynamicFields(input));
    if (this.operation === 'WITHDRAWAL') {
      generated.set(3, '011000');
      generated.set(4, input.amount!.replace('.', '').padStart(12, '0'));
    }
    const encoded = new Map<number, Buffer>();
    let body: Buffer | undefined;
    try {
      for (const field of fields) {
        const text = generated.get(field);
        const value =
          text !== undefined
            ? field === 37 || field === 41
              ? ebcdic(text)
              : Buffer.from(text, 'hex')
            : input.privateFields.get(field);
        if (!value || !value.length || value.length > 256) throw new Error('BALANCE_FIELD_INVALID');
        encoded.set(field, Buffer.from(value));
      }
      const prefix = Buffer.alloc(32);
      prefix.set(input.header);
      prefix.writeUInt16BE(0x0200, 22);
      for (const field of fields) {
        const index = 24 + Math.floor((field - 1) / 8);
        prefix[index] = prefix[index]! | (0x80 >> ((field - 1) % 8));
      }
      body = Buffer.concat([prefix, ...fields.map((field) => encoded.get(field)!)]);
      prefix.fill(0);
      body.writeUInt16BE(body.length, 3);
      const metadata = new CapturedVisaBalance(this.operation).inspect(body);
      return {
        wire: new CapturedVisaFraming().encode(body, input.extension),
        metadata,
        message: new CapturedVisaBalance(this.operation).message(body),
      };
    } finally {
      body?.fill(0);
      for (const value of encoded.values()) value.fill(0);
    }
  }
}
