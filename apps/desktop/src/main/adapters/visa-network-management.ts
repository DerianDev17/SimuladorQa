import { Buffer } from 'node:buffer';
import type { VisaNetworkRequestMetadata } from '../qa-network-probe-port';

const requestFields = [7, 11, 63, 70] as const;
const responseFields = [7, 11, 39, 63, 70] as const;

function bitmap(fields: readonly number[]): Buffer {
  const result = Buffer.alloc(16);
  result[0] = 0x80;
  for (const field of fields) {
    const index = Math.floor((field - 1) / 8);
    result[index] = result[index]! | (0x80 >> ((field - 1) % 8));
  }
  return result;
}

/** Limited to the observed 071/072 layout. Response semantics require an explicit policy. */
export class VisaNetworkManagement {
  inspect(source: Uint8Array): VisaNetworkRequestMetadata {
    if (!(source instanceof Uint8Array) || source.byteLength !== 56)
      throw new Error('VISA_NETWORK_UNSUPPORTED');
    const body = Buffer.from(source.buffer, source.byteOffset, source.byteLength);
    if (
      body[0] !== 22 ||
      body.readUInt16BE(3) !== body.length ||
      body.readUInt16BE(22) !== 0x0800 ||
      !body.subarray(24, 40).equals(bitmap(requestFields)) ||
      body[48] !== 5 ||
      ![0x0071, 0x0072].includes(body.readUInt16BE(54)) ||
      body.subarray(40, 48).some((byte) => byte >> 4 > 9 || (byte & 15) > 9)
    )
      throw new Error('VISA_NETWORK_UNSUPPORTED');
    return {
      mti: '0800',
      networkCode: body.readUInt16BE(54) === 0x0071 ? '071' : '072',
      stan: body.subarray(45, 48).toString('hex'),
      bodyBytes: 56,
      fields: [...requestFields],
    };
  }

  // Code supplied by the validated QA policy; never inferred from MTI or a financial result.
  reply(
    source: Uint8Array,
    responseCode: string,
  ): {
    body: Buffer;
    metadata: {
      mti: '0810';
      networkCode: '071' | '072';
      stan: string;
      responseCode: string;
      fields: readonly number[];
    };
  } {
    const request = this.inspect(source);
    if (typeof responseCode !== 'string' || !/^\d{2}$/.test(responseCode))
      throw new Error('VISA_NETWORK_RESPONSE_CODE_INVALID');
    const body = Buffer.from(source.buffer, source.byteOffset, source.byteLength);
    const response = Buffer.alloc(58);
    body.copy(response, 0, 0, 22);
    response.writeUInt16BE(response.length, 3);
    body.copy(response, 5, 8, 11);
    body.copy(response, 8, 5, 8);
    response.writeUInt16BE(0x0810, 22);
    bitmap(responseFields).copy(response, 24);
    body.copy(response, 40, 40, 48);
    // EBCDIC numeric characters occupy F0-F9. No general code-page mapping is assumed.
    response[48] = 0xf0 + Number(responseCode[0]);
    response[49] = 0xf0 + Number(responseCode[1]);
    body.copy(response, 50, 48, 56);
    return {
      body: response,
      metadata: {
        mti: '0810',
        networkCode: request.networkCode,
        stan: request.stan,
        responseCode,
        fields: [...responseFields],
      },
    };
  }
}
