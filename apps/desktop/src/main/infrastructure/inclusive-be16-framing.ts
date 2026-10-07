import { Buffer } from 'node:buffer';

// Mecánica de transporte, sin reglas de campos ISO ni acceso a sockets.
export class InclusiveBe16Framing {
  encode(body: Uint8Array): Buffer {
    const length = body.byteLength + 2;
    if (length > 0xffff) throw new Error('FRAME_TOO_LARGE');
    const frame = Buffer.alloc(length);
    frame.writeUInt16BE(length);
    frame.set(body, 2);
    return frame;
  }

  decoder(): InclusiveBe16Decoder {
    return new InclusiveBe16Decoder();
  }
}

export class InclusiveBe16Decoder {
  private readonly buffer = Buffer.alloc(0xffff);
  private used = 0;
  private expected = 2;
  private closed = false;

  push(chunk: Uint8Array): Buffer[] {
    if (this.closed) throw new Error('FRAME_DECODER_CLOSED');
    const bodies: Buffer[] = [];
    let cursor = 0;
    while (cursor < chunk.byteLength) {
      const take = Math.min(this.expected - this.used, chunk.byteLength - cursor);
      this.buffer.set(chunk.subarray(cursor, cursor + take), this.used);
      cursor += take;
      this.used += take;
      if (this.used !== this.expected) continue;
      if (this.expected === 2) {
        const length = this.buffer.readUInt16BE();
        if (length < 2) {
          this.clear();
          this.closed = true;
          throw new Error('FRAME_INVALID_LENGTH');
        }
        this.expected = length;
        if (length > 2) continue;
      }
      bodies.push(Buffer.from(this.buffer.subarray(2, this.expected)));
      this.clear();
    }
    return bodies;
  }

  // El dueño decide cuándo terminó la fuente. No inventa un timeout del banco.
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
    this.expected = 2;
  }
}
