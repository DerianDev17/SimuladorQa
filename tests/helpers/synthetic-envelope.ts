import { Buffer } from 'node:buffer';

// Solo datos sintéticos opacos. No es un golden de negocio ni un mensaje enviable.
export const syntheticBitmap = Buffer.from([
  0x82, 0x20, 0, 0, 0, 0, 0, 0, 0x04, 0, 0, 0, 0, 0, 0, 0,
])
  .toString('hex')
  .toUpperCase();
export function syntheticEnvelope(mti = '0200', data = Buffer.from('opaque-local-fixture')) {
  return Buffer.concat([Buffer.from('ISO016000040' + mti + syntheticBitmap), data]);
}
