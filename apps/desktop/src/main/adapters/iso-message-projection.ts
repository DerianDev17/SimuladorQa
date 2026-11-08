import {
  isPublicIsoField,
  protectedIsoValue,
  publicEmvTags,
  publicEmvValue,
  publicIsoValue,
  type IsoMessage,
} from '../../../../../packages/domain/src/iso-message';
import { parseCardTlv } from './emv-card-identity';
import type { SessionIsoMessage } from '../../../../../packages/shared/src/session-messages';

export interface DisplayFieldProfile {
  encoding: 'BCD' | 'EBCDIC' | 'BINARY';
  length: number;
  variable?: boolean;
}
// Printable subset verified against Windows .NET Encoding.GetEncoding(37).
// This decoder is display-only; it never changes the transaction codec.
function displayText(bytes: Buffer): string {
  const punctuation: Readonly<Record<number, string>> = {
    64: ' ',
    75: '.',
    77: '(',
    78: '+',
    92: '*',
    93: ')',
    96: '-',
    97: '/',
    107: ',',
    109: '_',
    122: ':',
  };
  return [...bytes]
    .map((byte) => {
      if (byte >= 0xf0 && byte <= 0xf9) return String(byte - 0xf0);
      for (const [first, last, ascii] of [
        [0xc1, 0xc9, 65],
        [0xd1, 0xd9, 74],
        [0xe2, 0xe9, 83],
        [0x81, 0x89, 97],
        [0x91, 0x99, 106],
        [0xa2, 0xa9, 115],
      ]) {
        if (byte >= first! && byte <= last!) return String.fromCharCode(ascii! + byte - first!);
      }
      const character = punctuation[byte];
      if (character === undefined) throw Error('ISO_DISPLAY_ENCODING_UNSUPPORTED');
      return character;
    })
    .join('');
}
function emvDisplay(encoded: Buffer, complete = false): IsoMessage['fields'][number]['tags'] {
  // Reuse the existing validated VISA 01/00/length envelope and BER-TLV parser.
  if (
    encoded[0] !== encoded.length - 1 ||
    encoded[1] !== 1 ||
    encoded[2] !== 0 ||
    encoded[3] !== encoded.length - 4
  )
    return undefined;
  try {
    const tags: NonNullable<IsoMessage['fields'][number]['tags']> = [];
    const collect = (nodes: ReturnType<typeof parseCardTlv>) => {
      for (const node of nodes) {
        if (node.children.length) collect(node.children);
        else
          tags.push({
            tag: node.tag,
            value: complete
              ? Buffer.from(node.value).toString('hex').toUpperCase()
              : publicEmvTags[node.tag]?.length === node.value.length
                ? publicEmvValue(
                    node.tag,
                    Buffer.from(node.value.buffer, node.value.byteOffset, node.value.byteLength)
                      .toString('hex')
                      .toUpperCase(),
                  )
                : protectedIsoValue,
          });
      }
    };
    collect(parseCardTlv(encoded.subarray(4)));
    return tags.length &&
      tags.length <= 64 &&
      new Set(tags.map((item) => item.tag)).size === tags.length
      ? tags
      : undefined;
  } catch {
    return undefined;
  }
}

// Operator-requested session view (ADR-037). Decode known encodings; preserve
// binary/unsupported text as HEX without interpreting undocumented subfields.
export function projectSessionIsoMessage(
  mti: IsoMessage['mti'],
  fields: ReadonlyMap<number, Buffer>,
  profiles: Readonly<Record<number, DisplayFieldProfile>>,
): SessionIsoMessage {
  return {
    visibility: 'UNMASKED_QA_SESSION',
    mti,
    fields: [...fields]
      .sort(([a], [b]) => a - b)
      .map(([number, encoded]) => {
        const profile = profiles[number];
        const bytes = encoded.subarray(profile?.variable ? 1 : 0);
        let value = `HEX ${bytes.toString('hex').toUpperCase()}`;
        if (profile?.encoding === 'BCD')
          value = bytes
            .toString('hex')
            .toUpperCase()
            .slice(-(profile.variable ? encoded[0]! : profile.length));
        else if (profile?.encoding === 'EBCDIC') {
          try {
            value = displayText(bytes);
          } catch {
            /* Preserve exact bytes as HEX. */
          }
        }
        const tags = number === 55 ? emvDisplay(encoded, true) : undefined;
        return { number, value, ...(tags ? { tags } : {}) };
      }),
  };
}
export function projectIsoMessage(
  mti: IsoMessage['mti'],
  fields: ReadonlyMap<number, Buffer>,
  profiles: Readonly<Record<number, DisplayFieldProfile>>,
): IsoMessage {
  return {
    mti,
    fields: [...fields]
      .sort(([a], [b]) => a - b)
      .map(([number, encoded]) => {
        let value = protectedIsoValue;
        const profile = profiles[number];
        if (profile && isPublicIsoField(number)) {
          const bytes = encoded.subarray(profile.variable ? 1 : 0);
          try {
            let candidate =
              profile.encoding === 'EBCDIC'
                ? displayText(bytes)
                : bytes.toString('hex').toUpperCase();
            if (profile.encoding === 'BCD')
              candidate = candidate.slice(-(profile.variable ? encoded[0]! : profile.length));
            if (number === 2)
              candidate = /^\d{16}$/.test(candidate)
                ? candidate.slice(0, 6) + 'X'.repeat(6) + candidate.slice(-4)
                : protectedIsoValue;
            value = publicIsoValue(number, candidate);
          } catch {
            /* Unsupported display values never change a financial result. */
          }
        }
        const tags = number === 55 ? emvDisplay(encoded) : undefined;
        return { number, value, ...(tags ? { tags } : {}) };
      }),
  };
}
