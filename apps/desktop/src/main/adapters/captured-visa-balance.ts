import { Buffer } from 'node:buffer';

// ISOBASEI + captured QA balance requests/responses. This is not a general ISO codec.
const profile: Record<
  number,
  { encoding: 'BCD' | 'EBCDIC' | 'BINARY'; length: number; variable?: true }
> = {
  2: { encoding: 'BCD', length: 19, variable: true },
  3: { encoding: 'BCD', length: 6 },
  4: { encoding: 'BCD', length: 12 },
  7: { encoding: 'BCD', length: 10 },
  11: { encoding: 'BCD', length: 6 },
  12: { encoding: 'BCD', length: 6 },
  13: { encoding: 'BCD', length: 4 },
  14: { encoding: 'BCD', length: 4 },
  15: { encoding: 'BCD', length: 4 },
  18: { encoding: 'BCD', length: 4 },
  19: { encoding: 'BCD', length: 3 },
  22: { encoding: 'BCD', length: 4 },
  23: { encoding: 'BCD', length: 3 },
  25: { encoding: 'BCD', length: 2 },
  28: { encoding: 'EBCDIC', length: 9 },
  32: { encoding: 'BCD', length: 11, variable: true },
  35: { encoding: 'BCD', length: 37, variable: true },
  37: { encoding: 'EBCDIC', length: 12 },
  39: { encoding: 'EBCDIC', length: 2 },
  41: { encoding: 'EBCDIC', length: 8 },
  42: { encoding: 'EBCDIC', length: 15 },
  43: { encoding: 'EBCDIC', length: 40 },
  48: { encoding: 'BINARY', length: 255, variable: true },
  49: { encoding: 'BCD', length: 3 },
  52: { encoding: 'BINARY', length: 8 },
  53: { encoding: 'BCD', length: 16 },
  54: { encoding: 'EBCDIC', length: 120, variable: true },
  55: { encoding: 'BINARY', length: 255, variable: true },
  60: { encoding: 'BINARY', length: 7, variable: true },
  62: { encoding: 'BINARY', length: 255, variable: true },
  63: { encoding: 'BINARY', length: 255, variable: true },
};
const requestFields = [
  2, 3, 4, 7, 11, 12, 13, 14, 15, 18, 19, 22, 23, 25, 28, 32, 35, 37, 41, 42, 43, 48, 49, 52, 53,
  55, 60, 62,
];
const responseFields = [2, 3, 7, 11, 15, 19, 25, 32, 37, 39, 41, 42, 48, 49, 54, 55, 63];

export interface CapturedBalanceMetadata {
  mti: '0200' | '0210';
  processingCode: '301000';
  stan: string;
  rrn: string;
  terminalId: string;
  currency: '840';
  panMask: string;
  bodyBytes: number;
  fields: number[];
  amount?: '0';
  responseCode?: string;
}
function invalid(): never {
  throw new Error('BALANCE_SOURCE_UNSUPPORTED');
}
function digits(bytes: Buffer, count: number): string {
  const text = bytes.toString('hex');
  if (!/^\d+$/.test(text)) invalid();
  return text.slice(-count);
}
function ebcdic(bytes: Buffer): string {
  return [...bytes]
    .map((byte) => {
      if (byte >= 0xf0 && byte <= 0xf9) return String(byte - 0xf0);
      if (byte >= 0xc1 && byte <= 0xc9) return String.fromCharCode(65 + byte - 0xc1);
      if (byte >= 0xd1 && byte <= 0xd9) return String.fromCharCode(74 + byte - 0xd1);
      if (byte >= 0xe2 && byte <= 0xe9) return String.fromCharCode(83 + byte - 0xe2);
      invalid();
    })
    .join('');
}

export class CapturedVisaBalance {
  inspect(source: Uint8Array): CapturedBalanceMetadata {
    return this.parse(source).metadata;
  }

  // Reassemble original spans; preserve dates, STAN, PIN/EMV and all private bytes.
  // No field generation, card substitution or withdrawal is supported.
  rebuildRequest(source: Uint8Array): Buffer {
    const parsed = this.parse(source);
    if (parsed.metadata.mti !== '0200') invalid();
    const body = Buffer.from(source.buffer, source.byteOffset, source.byteLength);
    return Buffer.concat([
      body.subarray(0, 32),
      ...parsed.spans.map(([start, end]) => body.subarray(start, end)),
    ]);
  }

  private parse(source: Uint8Array): {
    metadata: CapturedBalanceMetadata;
    spans: [number, number][];
  } {
    if (!(source instanceof Uint8Array) || source.length < 32 || source.length > 65535) invalid();
    const body = Buffer.from(source.buffer, source.byteOffset, source.byteLength);
    if (body[0] !== 22 || body.readUInt16BE(3) !== body.length || body[24]! & 0x80) invalid();
    const rawMti = body.readUInt16BE(22);
    if (![0x0200, 0x0210].includes(rawMti)) invalid();
    const mti = rawMti === 0x0200 ? '0200' : '0210';
    const fields: number[] = [];
    for (let bit = 1; bit < 64; bit++)
      if (body[24 + Math.floor(bit / 8)]! & (0x80 >> (bit % 8))) fields.push(bit + 1);
    const allowed = mti === '0200' ? requestFields : responseFields;
    if (
      mti === '0200'
        ? fields.join(',') !== allowed.join(',')
        : fields.some((field) => !allowed.includes(field)) ||
          [2, 3, 7, 11, 37, 39, 41, 49].some((field) => !fields.includes(field))
    )
      invalid();
    let cursor = 32;
    const values = new Map<number, Buffer>(),
      spans: [number, number][] = [];
    for (const field of fields) {
      const item = profile[field]!;
      const start = cursor,
        length = item.variable ? body[cursor++] : item.length;
      if (length === undefined || length > item.length || (item.variable && length === 0))
        invalid();
      const size = item.encoding === 'BCD' ? Math.ceil(length / 2) : length,
        end = cursor + size;
      if (end > body.length) invalid();
      if (field === 2 && length !== 16) invalid();
      values.set(field, body.subarray(cursor, end));
      spans.push([start, end]);
      cursor = end;
    }
    if (cursor !== body.length) invalid();
    const pan = digits(values.get(2)!, 16),
      processingCode = digits(values.get(3)!, 6);
    const currency = digits(values.get(49)!, 3);
    if (processingCode !== '301000' || currency !== '840') invalid();
    if (mti === '0200' && digits(values.get(4)!, 12) !== '0'.repeat(12)) invalid();
    const stan = digits(values.get(11)!, 6),
      rrn = ebcdic(values.get(37)!);
    const terminalId = ebcdic(values.get(41)!);
    if (!/^\d{12}$/.test(rrn) || !/^[A-Z0-9]{8}$/.test(terminalId)) invalid();
    digits(values.get(7)!, 10);
    const responseCode = mti === '0210' ? ebcdic(values.get(39)!) : undefined;
    if (responseCode !== undefined && !/^\d{2}$/.test(responseCode)) invalid();
    return {
      metadata: {
        mti,
        processingCode,
        stan,
        rrn,
        terminalId,
        currency,
        panMask: pan.slice(0, 6) + 'X'.repeat(6) + pan.slice(-4),
        bodyBytes: body.length,
        fields,
        ...(responseCode !== undefined ? { responseCode } : { amount: '0' as const }),
      },
      spans,
    };
  }
}
