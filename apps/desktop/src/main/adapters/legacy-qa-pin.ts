import { Buffer } from 'node:buffer';
import { isUuid } from '../../../../../packages/domain/src/catalogs';

// Boundary to a validated TEST cipher. Algorithm, key custody and zone mapping
// remain provider responsibilities; this adapter never accepts a clear key.
export interface QaPinCipher {
  encrypt(block: Uint8Array, keyReference: string, signal: AbortSignal): Promise<Uint8Array>;
}
export interface QaPinRequest {
  environment: 'QA';
  pan: Uint8Array;
  pin: Uint8Array;
  keyReference: string;
}

function decimalBytes(value: unknown, maximum: number): value is Uint8Array {
  return (
    value instanceof Uint8Array &&
    value.length > 0 &&
    value.length <= maximum &&
    value.every((byte) => byte >= 48 && byte <= 57)
  );
}
function overlaps(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.buffer === right.buffer &&
    left.byteOffset < right.byteOffset + right.byteLength &&
    right.byteOffset < left.byteOffset + left.byteLength
  );
}

// Mechanical port of ExtremeTools.CryptoTool.AnsiPinEncrypt IL 0..164.
// It preserves decimal D2 length from the source, including lengths >= 10;
// this is NOT a claim that the result is an approved ISO PIN format/profile.
// A cipher can be connected only through an explicit approved TEST profile.
export class LegacyQaPinEncryption {
  constructor(
    private readonly cipher: QaPinCipher,
    private readonly deadlineMs = 5000,
  ) {
    if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30000)
      throw Error('QA_PIN_CONFIGURATION_INVALID');
  }

  async encrypt(request: QaPinRequest, signal: AbortSignal): Promise<Buffer> {
    if (
      !request ||
      request.environment !== 'QA' ||
      !isUuid(request.keyReference) ||
      !decimalBytes(request.pan, 19) ||
      !decimalBytes(request.pin, 14)
    )
      throw Error('QA_PIN_INPUT_INVALID');
    if (signal.aborted) throw Error('QA_PIN_CANCELLED');

    const pan = Buffer.from(request.pan);
    const pin = Buffer.from(request.pin);
    const keyReference = request.keyReference;
    const pinField = Buffer.alloc(8, 0xff);
    const panField = Buffer.alloc(8);
    const block = Buffer.alloc(8);
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    let pending: Promise<Uint8Array> | undefined;
    let ciphertext: Uint8Array | undefined;
    try {
      pinField[0] = (Math.floor(pin.length / 10) << 4) | (pin.length % 10);
      for (let index = 0; index < pin.length; index++) {
        const byte = 1 + Math.floor(index / 2);
        const digit = pin[index]! - 48;
        pinField[byte] = index % 2 === 0 ? (digit << 4) | 0x0f : (pinField[byte]! & 0xf0) | digit;
      }
      // Pad PAN to 13, take the twelve digits before the final digit, pad to 16.
      // Missing leading digits contribute zero; no PAN string is allocated.
      for (let index = 0; index < 12; index++) {
        const source = pan.length - 13 + index;
        const digit = source < 0 ? 0 : pan[source]! - 48;
        const byte = 2 + Math.floor(index / 2);
        panField[byte] = panField[byte]! | (index % 2 === 0 ? digit << 4 : digit);
      }
      for (let index = 0; index < 8; index++) block[index] = pinField[index]! ^ panField[index]!;
      pending = Promise.resolve().then(() => {
        if (abort.signal.aborted) throw Error('QA_PIN_CANCELLED');
        return this.cipher.encrypt(block, keyReference, abort.signal);
      });
      // A provider that resolves after cancellation must not retain its output.
      void pending
        .then((value) => {
          if (abort.signal.aborted && value instanceof Uint8Array) value.fill(0);
        })
        .catch(() => undefined);
      const interrupted = new Promise<never>((_, reject) => {
        cancel = () => {
          abort.abort();
          reject(Error('QA_PIN_CANCELLED'));
        };
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
        timer = setTimeout(() => {
          abort.abort();
          reject(Error('QA_PIN_UNAVAILABLE'));
        }, this.deadlineMs);
      });
      ciphertext = await Promise.race([pending, interrupted]);
      if (
        abort.signal.aborted ||
        !(ciphertext instanceof Uint8Array) ||
        ciphertext.length !== 8 ||
        overlaps(ciphertext, block) ||
        overlaps(ciphertext, pan) ||
        overlaps(ciphertext, pin)
      )
        throw Error('QA_PIN_CIPHER_INVALID');
      return Buffer.from(ciphertext);
    } catch {
      throw Error(signal.aborted ? 'QA_PIN_CANCELLED' : 'QA_PIN_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
      if (cancel) signal.removeEventListener('abort', cancel);
      abort.abort();
      pan.fill(0);
      pin.fill(0);
      pinField.fill(0);
      panField.fill(0);
      block.fill(0);
      if (ciphertext instanceof Uint8Array) ciphertext.fill(0);
    }
  }
}
