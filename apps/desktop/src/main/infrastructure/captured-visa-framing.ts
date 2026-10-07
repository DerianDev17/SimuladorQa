import { Buffer } from 'node:buffer';

export interface CapturedVisaBody {
  extension: Buffer;
  opaqueBody: Buffer;
}

// Envolvente observada en VCP Lite: BE16 del cuerpo + dos bytes preservados.
// No interpreta extension ni campos ISO; no abre conexiones.
export class CapturedVisaFraming {
  encode(opaqueBody: Uint8Array, extension: Uint8Array): Buffer {
    if (!(opaqueBody instanceof Uint8Array) || !(extension instanceof Uint8Array))
      throw new Error('FRAME_INVALID_INPUT');
    if (extension.byteLength !== 2) throw new Error('FRAME_INVALID_EXTENSION');
    if (opaqueBody.byteLength > 0xffff) throw new Error('FRAME_TOO_LARGE');
    const frame = Buffer.alloc(opaqueBody.byteLength + 4);
    frame.writeUInt16BE(opaqueBody.byteLength);
    frame.set(extension, 2);
    frame.set(opaqueBody, 4);
    return frame;
  }

  decoder(): CapturedVisaDecoder {
    return new CapturedVisaDecoder();
  }
}

export class CapturedVisaDecoder {
  private readonly buffer = Buffer.alloc(0xffff + 4);
  private used = 0;
  private expected = 4;
  private headerRead = false;
  private closed = false;

  push(chunk: Uint8Array): CapturedVisaBody[] {
    if (this.closed) throw new Error('FRAME_DECODER_CLOSED');
    if (!(chunk instanceof Uint8Array)) throw new Error('FRAME_INVALID_INPUT');
    const messages: CapturedVisaBody[] = [];
    let cursor = 0;
    while (cursor < chunk.byteLength) {
      const take = Math.min(this.expected - this.used, chunk.byteLength - cursor);
      this.buffer.set(chunk.subarray(cursor, cursor + take), this.used);
      cursor += take;
      this.used += take;
      if (this.used !== this.expected) continue;
      if (!this.headerRead) {
        this.headerRead = true;
        this.expected = this.buffer.readUInt16BE() + 4;
        if (this.expected > 4) continue;
      }
      messages.push({
        extension: Buffer.from(this.buffer.subarray(2, 4)),
        opaqueBody: Buffer.from(this.buffer.subarray(4, this.expected)),
      });
      this.clear();
    }
    return messages;
  }

  finish(): void {
    if (this.closed) throw new Error('FRAME_DECODER_CLOSED');
    const incomplete = this.used !== 0;
    this.clear();
    this.closed = true;
    if (incomplete) throw new Error('FRAME_INCOMPLETE');
  }

  private clear(): void {
    this.buffer.fill(0, 0, this.used);
    this.used = 0;
    this.expected = 4;
    this.headerRead = false;
  }
}
