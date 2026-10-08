import { Buffer } from 'node:buffer';

// Labels verified in ISO8583MsgFormat.dll, Iso8583.GetStrType (static IL).
const encodingLabels = [
  'ASCII',
  'EBCDIC',
  'BINARY',
  'BCD',
  'BINBITMAP',
  'VLENISO',
  'VLENHEAD',
  'UNDEFINED',
  'ASCIIBITMAP',
  'NULL',
  'BINBITMAP8',
  'BCD_L',
  'BINBITMAP3',
  'DUMMYBITMAP',
  'EBCDICBYTEBITMAPSP',
  'CBLCOMP-3',
  'CBLCOMP',
  'CBLSCOMP',
  'ASCIIBYTEBITMAPSP',
  'ASCIIEBCDIC',
  'ASCIIBITMAP_NOERR',
] as const;

export interface ExtisoFieldEvidence {
  slot: number;
  identifier: number;
  name: string;
  encodingCode: number;
  encodingLabel: string;
  lengthParameter: number;
  attributeCode: number;
  paddingByte: number;
}

export interface ExtisoDefinitionEvidence {
  format: 'EXTISO_VISA_BASE_I_3';
  bytesConsumed: number;
  sourceDateTexts: [string, string];
  uninterpretedHeaderWords: [number, number];
  mtiField: ExtisoFieldEvidence;
  headerFields: ExtisoFieldEvidence[];
  fields: ExtisoFieldEvidence[];
  messageNames: { mti: string; name: string }[];
  definitionPairs: { mti: string; field: number }[];
  waitPairs: { mti: string; field: number }[];
}

function invalid(): never {
  throw new Error('EXTISO_DEFINITION_INVALID');
}

/** Inspects the received definition layout. Does not decode or generate transactions. */
export class ExtisoDefinitionInspector {
  inspect(source: Uint8Array): ExtisoDefinitionEvidence {
    if (source.byteLength < 262 || source.byteLength > 1_048_576) invalid();
    const bytes = Buffer.from(source.buffer, source.byteOffset, source.byteLength);
    const text = (offset: number, size: number): string => {
      if (offset + size > bytes.length) invalid();
      const part = bytes.subarray(offset, offset + size);
      const end = part.indexOf(0);
      const content = end === -1 ? part : part.subarray(0, end);
      if (content.some((value) => value < 32 || value > 126)) invalid();
      return content.toString('ascii');
    };
    if (text(0, 6) !== 'EXTISO' || text(6, 80) !== 'AlexSoft VISA BASE I Ver 3.0.0') {
      throw new Error('EXTISO_DEFINITION_UNSUPPORTED');
    }
    const sourceDateTexts: [string, string] = [text(86, 21), text(107, 21)];
    if (sourceDateTexts.some((date) => !/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(date)))
      invalid();
    const counts = [128, 130, 132, 134, 136].map((offset) => bytes.readUInt16LE(offset));
    const [headerCount, fieldCount, nameCount, definitionCount, waitCount] = counts;
    if (
      headerCount === undefined ||
      fieldCount !== 128 ||
      nameCount === undefined ||
      definitionCount === undefined ||
      waitCount === undefined ||
      headerCount > 64 ||
      nameCount > 256 ||
      nameCount === 0 ||
      definitionCount > 16_384 ||
      waitCount > 16_384
    )
      invalid();
    const expectedSize =
      262 +
      10 +
      headerCount * 120 +
      fieldCount * 120 +
      nameCount * 82 +
      definitionCount * 4 +
      waitCount * 4;
    if (bytes.length !== expectedSize) invalid();

    const record = (offset: number, slot: number): ExtisoFieldEvidence => {
      const name = text(offset + 8, 50);
      const encodingCode = bytes[offset + 1]!;
      const encodingLabel = encodingCode === 0 ? 'EMPTY' : encodingLabels[encodingCode - 1];
      if (
        encodingLabel === undefined ||
        !/^(?:MTI|BITMAP|VH[A-Z]+|V\d{3}_[A-Za-z][A-Za-z0-9_]*|)$/.test(name)
      )
        invalid();
      if ((name === '') !== (encodingCode === 0)) invalid();
      return {
        slot,
        identifier: bytes[offset]!,
        name,
        encodingCode,
        encodingLabel,
        lengthParameter: bytes.readUInt32LE(offset + 2),
        attributeCode: bytes[offset + 6]!,
        paddingByte: bytes[offset + 7]!,
      };
    };
    const mtiField = record(142, 0);
    if (mtiField.name !== 'MTI') invalid();
    let cursor = 262;
    const section = <T>(
      count: number,
      width: number,
      read: (offset: number, slot: number) => T,
    ): T[] => {
      if (bytes.readUInt16LE(cursor) !== count) invalid();
      cursor += 2;
      const items = Array.from({ length: count }, (_, slot) => read(cursor + slot * width, slot));
      cursor += count * width;
      return items;
    };
    const headerFields = section(headerCount, 120, record);
    if (headerFields.some((field) => !/^VH[A-Z]+$/.test(field.name))) invalid();
    const fields = section(fieldCount, 120, record);
    for (const field of fields) {
      if (field.slot === 0) {
        if (field.name !== 'BITMAP') invalid();
      } else if (field.slot === 1) {
        if (field.name !== '') invalid();
      } else if (
        field.identifier !== field.slot ||
        !field.name.startsWith(`V${String(field.slot).padStart(3, '0')}_`)
      )
        invalid();
    }
    const messageNames = section(nameCount, 82, (offset) => {
      const id = bytes.readUInt16LE(offset);
      const name = text(offset + 2, 80);
      if (id > 9999 || !/^[A-Za-z][A-Za-z ()/-]{0,79}$/.test(name)) invalid();
      return { mti: String(id).padStart(4, '0'), name };
    });
    const knownMtis = new Set(messageNames.map((message) => message.mti));
    if (knownMtis.size !== nameCount) invalid();
    const pairs = (count: number) => {
      const result = section(count, 4, (offset) => ({
        mti: String(bytes.readUInt16LE(offset)).padStart(4, '0'),
        field: bytes.readUInt16LE(offset + 2),
      }));
      if (
        result.some((pair) => !knownMtis.has(pair.mti) || pair.field < 2 || pair.field > 127) ||
        new Set(result.map((pair) => `${pair.mti}:${pair.field}`)).size !== count
      )
        invalid();
      return result;
    };
    const definitionPairs = pairs(definitionCount);
    const waitPairs = pairs(waitCount);
    if (cursor !== bytes.length) invalid();
    return {
      format: 'EXTISO_VISA_BASE_I_3',
      bytesConsumed: cursor,
      sourceDateTexts,
      uninterpretedHeaderWords: [bytes.readUInt16LE(138), bytes.readUInt16LE(140)],
      mtiField,
      headerFields,
      fields,
      messageNames,
      definitionPairs,
      waitPairs,
    };
  }
}
