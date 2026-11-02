import type { AccountType } from '../../../../packages/domain/src/transaction-draft';
import type { IsoMessage } from '../../../../packages/domain/src/iso-message';

// Main-only contracts for the supported QA profile; no security bytes reach IPC.
export interface HostCalendar {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}
export interface BalanceDynamicInput {
  account: AccountType;
  sequence: number;
  transmission: HostCalendar;
  local: HostCalendar;
  accounting: HostCalendar;
  terminalId: string;
}
export interface NewBalanceInput extends BalanceDynamicInput {
  header: Uint8Array;
  extension: Uint8Array;
  // Fresh, provider-generated encoded fields; never sourced from a replay/Renderer.
  privateFields: ReadonlyMap<number, Uint8Array>;
  amount?: string;
}
export interface CapturedBalanceMetadata {
  mti: '0200' | '0210';
  processingCode: '301000' | '011000';
  stan: string;
  rrn: string;
  terminalId: string;
  currency: '840';
  panMask: string;
  bodyBytes: number;
  fields: number[];
  amount?: string;
  responseCode?: string;
}
export interface FinancialMessageBuilder {
  build(input: NewBalanceInput): {
    wire: Uint8Array;
    metadata: CapturedBalanceMetadata;
    message: IsoMessage;
  };
}
