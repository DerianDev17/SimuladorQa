import { Buffer } from 'node:buffer';

export function syntheticExtisoDefinition(): Buffer {
  // Received layout: 262-byte header, counted sections, 120/82/4-byte records.
  const source = Buffer.alloc(262 + 10 + 120 + 128 * 120 + 82 + 4 + 4);
  source.write('EXTISO', 0);
  source.write('AlexSoft VISA BASE I Ver 3.0.0', 6);
  source.write('2023/04/25 08:27:02', 86);
  source.write('2023/11/14 16:19:33', 107);
  [1, 128, 1, 1, 1].forEach((count, index) => source.writeUInt16LE(count, 128 + index * 2));
  const record = (offset: number, id: number, code: number, length: number, name: string) => {
    source[offset] = id;
    source[offset + 1] = code;
    source.writeUInt32LE(length, offset + 2);
    source.write(name, offset + 8);
    source.write('synthetic-private-default', offset + 68);
  };
  record(142, 0, 4, 4, 'MTI');
  source.writeUInt16LE(1, 262);
  record(264, 0, 7, 2, 'VHLEN');
  source.writeUInt16LE(128, 384);
  record(386, 0, 5, 24, 'BITMAP');
  for (let field = 2; field < 128; field++) {
    record(
      386 + field * 120,
      field,
      field === 41 ? 2 : 4,
      field === 41 ? 8 : 6,
      `V${String(field).padStart(3, '0')}_Synthetic`,
    );
  }
  source.writeUInt16LE(1, 15746);
  source.writeUInt16LE(200, 15748);
  source.write('Authorization Request SMS', 15750);
  source.writeUInt16LE(1, 15830);
  source.writeUInt16LE(200, 15832);
  source.writeUInt16LE(41, 15834);
  source.writeUInt16LE(1, 15836);
  source.writeUInt16LE(200, 15838);
  source.writeUInt16LE(41, 15840);
  return source;
}
