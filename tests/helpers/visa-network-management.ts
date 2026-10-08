import { Buffer } from 'node:buffer';

export function networkManagementRequest(): Buffer {
  const body = Buffer.alloc(56);
  body[0] = 22;
  body[1] = 1;
  body.writeUInt16BE(56, 3);
  body.set([0x12, 0x34, 0x50], 5);
  body.set([0x54, 0x32, 0x10], 8);
  body.writeUInt16BE(0x0800, 22);
  body[24] = 0x82;
  body[25] = 0x20;
  body[31] = 0x02;
  body[32] = 0x04;
  body.set([0x10, 0x08, 0x12, 0x34, 0x56], 40);
  body.set([0x65, 0x43, 0x21], 45);
  body[48] = 5;
  body.set([0x31, 0x32, 0x33, 0x34, 0x35], 49);
  body.writeUInt16BE(0x0072, 54);
  return body;
}
