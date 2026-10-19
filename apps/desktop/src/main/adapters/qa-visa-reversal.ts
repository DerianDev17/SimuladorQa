import { CapturedVisaBalance, capturedVisaFieldProfile } from './captured-visa-balance';
import { CapturedVisaFraming } from '../infrastructure/captured-visa-framing';
import { parseCardTlv } from './emv-card-identity';

const retained = [2, 3, 4, 11, 12, 13, 14, 15, 18, 19, 22, 25, 32, 35, 37, 41, 42, 43, 49];
function fail(): never {
  throw Error('QA_REVERSAL_PROFILE_UNSUPPORTED');
}
function text(value: string): Buffer {
  return Buffer.from(
    [...value].map((c) => {
      if (/\d/.test(c)) return 0xf0 + Number(c);
      if (c === '*') return 0x5c;
      const n = c.charCodeAt(0);
      if (n >= 65 && n <= 73) return 0xc1 + n - 65;
      if (n >= 74 && n <= 82) return 0xd1 + n - 74;
      if (n >= 83 && n <= 90) return 0xe2 + n - 83;
      return fail();
    }),
  );
}
function variable(bytes: Buffer): Buffer {
  if (!bytes.length || bytes.length > 255) fail();
  return Buffer.concat([Buffer.of(bytes.length), bytes]);
}
function privateData(original: Buffer, originalData: string): Buffer {
  const segments = new Map<string, Buffer>();
  const types = ['BR', 'EO', 'CO', 'TC', 'NL', 'IP', 'S2', 'DD', 'R', 'A', 'D', 'X'];
  if (original[0] !== original.length - 1 || original[1] !== 0x5c) fail();
  let cursor = 1;
  while (cursor < original.length) {
    let end = original.indexOf(0x5c, cursor + 1);
    if (end < 0) end = original.length;
    const segment = original.subarray(cursor + 1, end);
    const type = types.find((key) => segment.subarray(0, key.length).equals(text(key)));
    if (!type || segments.has(type)) fail();
    if (['A', 'D', 'X'].includes(type)) {
      const length = segment.subarray(1, 3);
      if (
        [...length].some((b) => b < 0xf0 || b > 0xf9) ||
        (length[0]! - 0xf0) * 10 + length[1]! - 0xf0 !== segment.length - 3
      )
        fail();
    } else {
      const fixed: Record<string, number> = {
        BR: 7,
        EO: 6,
        R: 3,
        CO: 6,
        TC: 3,
        NL: 8,
        S2: 11,
        DD: 6,
      };
      if (fixed[type] !== undefined && segment.length !== fixed[type]) fail();
    }
    segments.set(type, segment);
    cursor = end;
  }
  const order = ['EO', 'A', 'BR', 'CO', 'F90', 'R', 'X', 'D', 'TC', 'S2', 'DD'];
  const f90 = text('F9042' + originalData);
  segments.set('F90', f90);
  let joined: Buffer | undefined;
  try {
    joined = Buffer.concat(
      order.flatMap((key) => {
        const value = segments.get(key);
        if (!value && !['D', 'S2'].includes(key)) fail();
        return value ? [Buffer.of(0x5c), value] : [];
      }),
    );
    return variable(joined);
  } finally {
    f90.fill(0);
    joined?.fill(0);
  }
}

// ATMIso8583.GenerarReversoIso8583 + GetDataEMVMastercardR, ISOBASEI,
// and the two 2026-10-19 QA pairs. Explicit full reversal, zero cash/fee.
// The caller supplies this execution's live EMV state; no captured IAD is used.
export class QaVisaReversal {
  private readonly fields = new Map<number, Buffer>();
  private readonly header: Buffer;
  private readonly extension: Buffer;
  private readonly createdAt = Date.now();
  private disposed = false;

  constructor(wire: Uint8Array) {
    const decoder = new CapturedVisaFraming().decoder();
    const frames = decoder.push(wire);
    this.header = Buffer.alloc(22);
    this.extension = Buffer.alloc(2);
    try {
      decoder.finish();
      if (frames.length !== 1) fail();
      const frame = frames[0]!;
      const codec = new CapturedVisaBalance('WITHDRAWAL');
      const source = codec.encodedFields(frame.opaqueBody);
      if (codec.inspect(frame.opaqueBody).mti !== '0200') fail();
      frame.opaqueBody.copy(this.header, 0, 0, 22);
      frame.extension.copy(this.extension);
      for (const field of retained) this.fields.set(field, Buffer.from(source.get(field)!));
      const fee = source.get(28)!;
      if (!fee.equals(text('D00000000'))) fail();
      this.fields.set(28, text('C00000000'));
      const acquirer = source.get(32)!;
      const digits = acquirer.subarray(1).toString('hex').slice(-acquirer[0]!);
      const date = source.get(7)!.toString('hex');
      if (!/^\d{1,11}$/.test(digits) || !/^\d{10}$/.test(date)) fail();
      const originalData =
        '0200' + source.get(11)!.toString('hex') + date + digits.padStart(11, '0') + '0'.repeat(11);
      this.fields.set(90, Buffer.from(originalData, 'hex'));
      this.fields.set(48, privateData(source.get(48)!, originalData));
      const emv = source.get(55)!;
      if (emv[0] !== emv.length - 1 || emv[1] !== 1 || emv[2] !== 0 || emv[3] !== emv.length - 4)
        fail();
      const nodes = parseCardTlv(emv.subarray(4));
      const selected = ['9F10', '95'].map((tag) => {
        const matches = nodes.filter((node) => node.tag === tag);
        if (
          matches.length !== 1 ||
          !matches[0]!.value.length ||
          (tag === '95' ? matches[0]!.value.length !== 5 : matches[0]!.value.length > 32)
        )
          fail();
        return Buffer.concat([
          Buffer.from(tag, 'hex'),
          Buffer.of(matches[0]!.value.length),
          matches[0]!.value,
        ]);
      });
      const tags = Buffer.concat(selected);
      const envelope = Buffer.concat([Buffer.of(1, 0, tags.length), tags]);
      this.fields.set(55, variable(envelope));
      for (const b of [...selected, tags, envelope]) b.fill(0);
      this.fields.set(60, Buffer.of(1, 0x22));
      this.fields.set(95, text('0'.repeat(42)));
      this.fields.set(39, text('00'));
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const frame of frames) {
        frame.opaqueBody.fill(0);
        frame.extension.fill(0);
      }
    }
  }

  build(approvedResponse: Buffer): Buffer {
    if (this.disposed) fail();
    const codec = new CapturedVisaBalance('WITHDRAWAL');
    const response = codec.encodedFields(approvedResponse);
    if (
      codec.inspect(approvedResponse).mti !== '0210' ||
      !response.get(39)?.equals(text('00')) ||
      [2, 3, 4, 11, 37, 41, 49].some((f) => !response.get(f)?.equals(this.fields.get(f)!))
    )
      fail();
    const authorization = response.get(38);
    if (
      !authorization ||
      authorization.length !== 6 ||
      [...authorization].some((b) => b < 0xf0 || b > 0xf9)
    )
      fail();
    this.fields.get(38)?.fill(0);
    this.fields.set(38, Buffer.from(authorization));
    const time = this.fields.get(12)!.toString('hex');
    if (
      !/^\d{6}$/.test(time) ||
      Number(time.slice(0, 2)) > 23 ||
      Number(time.slice(2, 4)) > 59 ||
      Number(time.slice(4)) > 59
    )
      fail();
    const seconds =
      (Number(time.slice(0, 2)) * 3600 +
        Number(time.slice(2, 4)) * 60 +
        Number(time.slice(4)) +
        Math.floor((Date.now() - this.createdAt) / 1000)) %
      86400;
    const clock = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join('');
    const prefix = Buffer.alloc(40);
    prefix.set(this.header);
    prefix.writeUInt16BE(0x0420, 22);
    prefix[24] = 0x80;
    const fields = [...this.fields.keys()].sort((a, b) => a - b);
    for (const field of fields) {
      const i = 24 + Math.floor((field - 1) / 8);
      prefix[i] = prefix[i]! | (0x80 >> ((field - 1) % 8));
    }
    const body = Buffer.concat([
      prefix,
      ...fields.map((f) => (f === 12 ? Buffer.from(clock, 'hex') : this.fields.get(f)!)),
    ]);
    try {
      body.writeUInt16BE(body.length, 3);
      return new CapturedVisaFraming().encode(body, this.extension);
    } finally {
      body.fill(0);
      prefix.fill(0);
    }
  }

  response(body: Buffer): string | undefined {
    if (
      this.disposed ||
      body.length < 40 ||
      body[0] !== 22 ||
      body.readUInt16BE(3) !== body.length ||
      body.readUInt16BE(22) !== 0x0430 ||
      !(body[24]! & 0x80) ||
      body[32]! & 0x80
    )
      fail();
    const allowed = [2, 3, 7, 11, 15, 19, 25, 32, 37, 39, 41, 42, 48, 63, 90];
    const fields = new Map<number, Buffer>();
    let cursor = 40;
    for (let field = 2; field <= 128; field++) {
      if (!(body[24 + Math.floor((field - 1) / 8)]! & (0x80 >> ((field - 1) % 8)))) continue;
      if (!allowed.includes(field)) fail();
      const spec =
        field === 90
          ? { encoding: 'BINARY', length: 21, variable: false }
          : capturedVisaFieldProfile[field]!;
      const start = cursor;
      const length = spec.variable ? body[cursor++] : spec.length;
      if (length === undefined || length === 0 || length > spec.length) fail();
      cursor += spec.encoding === 'BCD' ? Math.ceil(length / 2) : length;
      if (cursor > body.length) fail();
      fields.set(field, body.subarray(start, cursor));
    }
    if (cursor !== body.length || [2, 3, 11, 37, 39, 41, 90].some((f) => !fields.has(f))) fail();
    if ([2, 3, 11, 37, 41].some((f) => !fields.get(f)!.equals(this.fields.get(f)!)))
      return undefined;
    const originalData = this.fields.get(90)!,
      returnedData = fields.get(90)!;
    // Both real 0430s normalize F90's transmission hour (+5). Correlate the
    // original MTI/STAN and institutions, plus PAN/RRN/terminal above; do not
    // invent a general timezone conversion from two captures.
    if (!/^\d{42}$/.test(returnedData.toString('hex'))) fail();
    if (
      !returnedData.subarray(0, 5).equals(originalData.subarray(0, 5)) ||
      !returnedData.subarray(10).equals(originalData.subarray(10))
    )
      return undefined;
    const rc = fields.get(39)!;
    if (rc.length !== 2 || [...rc].some((b) => b < 0xf0 || b > 0xf9)) fail();
    return [...rc].map((b) => b - 0xf0).join('');
  }

  dispose(): void {
    this.disposed = true;
    for (const value of this.fields.values()) value.fill(0);
    this.fields.clear();
    this.header.fill(0);
    this.extension.fill(0);
  }
}
