import { withdrawalFixture } from './withdrawal';
import { capturedVisaFieldProfile } from '../../apps/desktop/src/main/adapters/captured-visa-balance';

export function testEbcdic(value: string): Buffer {
  return Buffer.from(
    [...value].map((c) => {
      if (/\d/.test(c)) return 0xf0 + Number(c);
      if (c === '*') return 0x5c;
      const n = c.charCodeAt(0);
      return n <= 73 ? 0xc1 + n - 65 : n <= 82 ? 0xd1 + n - 74 : 0xe2 + n - 83;
    }),
  );
}
export function reversalFixture() {
  const f = withdrawalFixture();
  f.request.reversalDelaySeconds = 1;
  const fields = new Map(f.lease.privateFields);
  const privateData = testEbcdic(
    '*BR00001*EO0001*R00*A04TEST*D04TEST*CO0001*X010*TCA*NL000001*IP127.0.0.1*DD0001',
  );
  fields.set(28, testEbcdic('D00000000'));
  fields.set(48, Buffer.concat([Buffer.of(privateData.length), privateData]));
  const tags = Buffer.from('9F100701020304050607950580000400009F26080000000000000000', 'hex');
  fields.set(55, Buffer.concat([Buffer.of(tags.length + 3, 1, 0, tags.length), tags]));
  f.lease.privateFields = fields;
  return f;
}
export function reversalFields(body: Buffer): Map<number, Buffer> {
  const size = body[24]! & 0x80 ? 16 : 8;
  let cursor = 24 + size;
  const fields = new Map<number, Buffer>();
  for (let f = 2; f <= size * 8; f++) {
    if (!(body[24 + Math.floor((f - 1) / 8)]! & (0x80 >> ((f - 1) % 8)))) continue;
    const s =
      f === 90
        ? { length: 21, encoding: 'BINARY', variable: false }
        : f === 95
          ? { length: 42, encoding: 'EBCDIC', variable: false }
          : capturedVisaFieldProfile[f]!;
    const start = cursor;
    const length = s.variable ? body[cursor++]! : s.length;
    cursor += s.encoding === 'BCD' ? Math.ceil(length / 2) : length;
    fields.set(f, Buffer.from(body.subarray(start, cursor)));
  }
  return fields;
}
export function testIso(mti: number, fields: Map<number, Buffer>): Buffer {
  const sorted = [...fields.keys()].sort((a, b) => a - b);
  const prefix = Buffer.alloc(sorted.at(-1)! > 64 ? 40 : 32);
  prefix[0] = 22;
  prefix.writeUInt16BE(mti, 22);
  if (prefix.length === 40) prefix[24] = 0x80;
  for (const f of sorted) {
    const i = 24 + Math.floor((f - 1) / 8);
    prefix[i] = prefix[i]! | (0x80 >> ((f - 1) % 8));
  }
  const body = Buffer.concat([prefix, ...sorted.map((f) => fields.get(f)!)]);
  body.writeUInt16BE(body.length, 3);
  return body;
}
export function reversalResponse(
  original: Buffer,
  code = '00',
  change?: (f: Map<number, Buffer>) => void,
): Buffer {
  const originalFields = reversalFields(original);
  const fields = new Map(
    [2, 3, 11, 15, 19, 25, 32, 37, 41, 42, 48, 90].map((f) => [f, originalFields.get(f)!]),
  );
  fields.set(7, Buffer.alloc(5));
  fields.set(39, testEbcdic(code));
  fields.set(63, Buffer.of(1, 0));
  change?.(fields);
  return testIso(0x0430, fields);
}
