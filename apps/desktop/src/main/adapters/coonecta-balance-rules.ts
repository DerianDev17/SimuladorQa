import type { BalanceValue } from '../../../../../packages/domain/src/balance-inquiry';
import type { AccountType } from '../../../../../packages/domain/src/transaction-draft';

export interface HostCalendar {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}
function calendar(value: HostCalendar): Date {
  const numbers = [value.year, value.month, value.day, value.hour, value.minute, value.second];
  if (!numbers.every(Number.isInteger) || value.year < 2000 || value.year > 2099)
    throw new Error('BALANCE_CALENDAR_INVALID');
  // UTC is used only for calendar arithmetic, not as an assumed wire timezone.
  const date = new Date(
    Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second),
  );
  if (
    date.getUTCFullYear() !== value.year ||
    date.getUTCMonth() + 1 !== value.month ||
    date.getUTCDate() !== value.day ||
    date.getUTCHours() !== value.hour ||
    date.getUTCMinutes() !== value.minute ||
    date.getUTCSeconds() !== value.second
  )
    throw new Error('BALANCE_CALENDAR_INVALID');
  return date;
}
const two = (number: number) => String(number).padStart(2, '0');
export interface BalanceDynamicInput {
  account: AccountType;
  sequence: number;
  transmission: HostCalendar;
  local: HostCalendar;
  accounting: HostCalendar;
  terminalId: string;
}
export function balanceDynamicFields(input: BalanceDynamicInput): ReadonlyMap<number, string> {
  calendar(input.transmission);
  const local = calendar(input.local);
  calendar(input.accounting);
  if (
    !['SAVINGS', 'CURRENT'].includes(input.account) ||
    !Number.isInteger(input.sequence) ||
    input.sequence < 1 ||
    input.sequence > 999999 ||
    !/^[A-Z0-9]{8}$/.test(input.terminalId)
  )
    throw new Error('BALANCE_DYNAMIC_INPUT_INVALID');
  const monthDay = (date: HostCalendar) => two(date.month) + two(date.day);
  const time = (date: HostCalendar) => two(date.hour) + two(date.minute) + two(date.second);
  const dayOfYear = Math.floor((local.getTime() - Date.UTC(input.local.year, 0, 1)) / 86400000) + 1;
  return new Map([
    [3, input.account === 'SAVINGS' ? '301000' : '302000'],
    [4, '0'.repeat(12)],
    [7, monthDay(input.transmission) + time(input.transmission)],
    [11, String(input.sequence).padStart(6, '0')],
    [12, time(input.local)],
    [13, monthDay(input.local)],
    [15, monthDay(input.accounting)],
    [
      37,
      String(input.local.year).slice(-1) +
        String(dayOfYear).padStart(3, '0') +
        String(input.sequence).padStart(8, '0'),
    ],
    [41, input.terminalId],
  ]);
}

// ATMIso8583.GetSaldos + CB frame 224. Neutral type labels pending profile semantics.
export function parseBalanceValues(text: string): readonly BalanceValue[] {
  if (!text.length || text.length > 120 || text.length % 20 !== 0)
    throw new Error('BALANCE_VALUES_INVALID');
  const values: BalanceValue[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < text.length; offset += 20) {
    const record = text.slice(offset, offset + 20);
    if (!/^\d{7}[CD]\d{12}$/.test(record)) throw new Error('BALANCE_VALUES_INVALID');
    const accountCode = record.slice(0, 2),
      type = record.slice(2, 4),
      currency = record.slice(4, 7);
    if (type !== '01' && type !== '02' && type !== '91')
      throw new Error('BALANCE_TYPE_UNSUPPORTED');
    const key = `${accountCode}/${type}/${currency}`;
    if (seen.has(key)) throw new Error('BALANCE_VALUES_AMBIGUOUS');
    seen.add(key);
    const minor = BigInt(record.slice(8));
    const amount = `${record[7] === 'D' && minor !== 0n ? '-' : ''}${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
    values.push({ accountCode, type, currency, amount });
  }
  return values;
}
