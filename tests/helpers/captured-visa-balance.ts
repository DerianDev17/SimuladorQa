import { Buffer } from 'node:buffer';

// Layout from CB QA sample. All card/private/PIN/EMV contents are synthetic.
function numericText(text: string): Buffer {
  return Buffer.from([...text].map((digit) => 0xf0 + Number(digit)));
}
const fakePan = () => Buffer.of(16, 0x41, 0x11, 0x11, 0, 0, 0, 0, 0);
const variable = (size: number, padding = 0) =>
  Buffer.concat([Buffer.of(size), Buffer.alloc(size, padding)]);
function message(mti: number, values: [number, Buffer][]): Buffer {
  const header = Buffer.alloc(32);
  header[0] = 22;
  header[1] = 1;
  header.writeUInt16BE(mti, 22);
  for (const [field] of values) {
    const index = 24 + Math.floor((field - 1) / 8);
    header[index] = header[index]! | (0x80 >> ((field - 1) % 8));
  }
  const result = Buffer.concat([header, ...values.map(([, bytes]) => bytes)]);
  result.writeUInt16BE(result.length, 3);
  return result;
}
const rrn = () => numericText('1'.repeat(6) + '007923');
const terminal = () => Buffer.from([0xc1, 0xe3, 0xd4, 0xf2, 0xf0, 0xf5, 0xf2, 0xf1]);

export function capturedBalanceRequest(): Buffer {
  return message(0x0200, [
    [2, fakePan()],
    [3, Buffer.of(0x30, 0x10, 0)],
    [4, Buffer.alloc(6)],
    [7, Buffer.from([0x10, 0x08, 0x12, 0x41, 0x23])],
    [11, Buffer.of(0, 0x79, 0x23)],
    [12, Buffer.of(0x12, 0x41, 0x23)],
    [13, Buffer.of(0x10, 0x08)],
    [14, Buffer.alloc(2)],
    [15, Buffer.alloc(2)],
    [18, Buffer.of(0x60, 0x11)],
    [19, Buffer.of(0x02, 0x18)],
    [22, Buffer.of(0x05, 0x10)],
    [23, Buffer.alloc(2)],
    [25, Buffer.alloc(1)],
    [28, Buffer.alloc(9, 0x40)],
    [32, Buffer.concat([Buffer.of(11), Buffer.alloc(6)])],
    [35, Buffer.concat([Buffer.of(37), Buffer.alloc(19)])],
    [37, rrn()],
    [41, terminal()],
    [42, Buffer.alloc(15, 0x40)],
    [43, Buffer.alloc(40, 0x40)],
    [48, variable(94)],
    [49, Buffer.of(0x08, 0x40)],
    [52, Buffer.alloc(8)],
    [53, Buffer.alloc(8)],
    [55, variable(219)],
    [60, variable(1)],
    [62, variable(9)],
  ]);
}
export function capturedBalanceResponse(code = '00'): Buffer {
  return message(0x0210, [
    [2, fakePan()],
    [3, Buffer.of(0x30, 0x10, 0)],
    [7, Buffer.from([0x10, 0x08, 0x12, 0x41, 0x23])],
    [11, Buffer.of(0, 0x79, 0x23)],
    [15, Buffer.alloc(2)],
    [19, Buffer.of(0x02, 0x18)],
    [25, Buffer.alloc(1)],
    [32, Buffer.concat([Buffer.of(11), Buffer.alloc(6)])],
    [37, rrn()],
    [39, numericText(code)],
    [41, terminal()],
    [42, Buffer.alloc(15, 0x40)],
    [48, variable(32)],
    [49, Buffer.of(0x08, 0x40)],
    [54, variable(40, 0x40)],
    [55, variable(20)],
    [63, variable(5)],
  ]);
}
