import { Buffer } from 'node:buffer';

// Perfil observado en las capturas del enlace 4946; no representa Mediator XML.
export const capturedHeaders = [
  'ISO006000040',
  'ISO006000047',
  'ISO006000060',
  'ISO016000040',
  'ISO016000044',
  'ISO016000045',
  'ISO016000046',
  'ISO016000047',
  'ISO016000055',
] as const;
export const capturedMtis = ['0200', '0210', '0420', '0430', '0800', '0810'] as const;

export interface EnvelopeMetadata {
  header: string;
  mti: string;
  fields: readonly number[];
  opaqueDataBytes: number;
}

export interface PrivateEnvelope {
  metadata: EnvelopeMetadata;
  bitmap: string;
  opaqueData: Buffer;
}

export class CapturedBanredEnvelope {
  decode(body: Uint8Array): PrivateEnvelope {
    // Revisar bytes antes de convertir: Node ASCII puede descartar el bit alto.
    if (body.byteLength < 48 || body.subarray(0, 48).some((byte) => byte > 0x7f))
      throw new Error('ENVELOPE_INVALID');
    const raw = Buffer.from(body);
    const header = raw.toString('ascii', 0, 12);
    const mti = raw.toString('ascii', 12, 16);
    const bitmap = raw.toString('ascii', 16, 48);
    if (
      !capturedHeaders.some((known) => known === header) ||
      !capturedMtis.some((known) => known === mti) ||
      !/^[0-9A-F]{32}$/.test(bitmap)
    )
      throw new Error('ENVELOPE_UNSUPPORTED');
    const bits = Buffer.from(bitmap, 'hex');
    // Todas las muestras tienen bitmap secundario y no anuncian uno terciario.
    if (!(bits[0]! & 0x80) || bits[8]! & 0x80) throw new Error('ENVELOPE_UNSUPPORTED_BITMAP');
    const fields: number[] = [];
    for (let bit = 1; bit < 128; bit++) {
      if (bits[Math.floor(bit / 8)]! & (0x80 >> (bit % 8))) fields.push(bit + 1);
    }
    return {
      metadata: { header, mti, fields, opaqueDataBytes: raw.byteLength - 48 },
      bitmap,
      opaqueData: raw.subarray(48),
    };
  }

  encode(header: string, mti: string, bitmap: string, opaqueData: Uint8Array): Buffer {
    // No admite caracteres multibyte ni trunca valores para que encajen.
    if (header.length !== 12 || mti.length !== 4 || bitmap.length !== 32)
      throw new Error('ENVELOPE_INVALID');
    const body = Buffer.concat([Buffer.from(header + mti + bitmap, 'utf8'), opaqueData]);
    this.decode(body);
    return body;
  }
}
