import {
  isoFieldLabels,
  protectedIsoValue,
  publicEmvTags,
  type IsoMessage,
} from '../../../../packages/domain/src/iso-message';

// Format either display DTO. No wire reconstruction or decryption.
export function formatIsoMessageText(message: IsoMessage): string {
  const direction = message.mti === '0210' || message.mti === '0430' ? 'RESP' : 'REQ';
  return [
    `${direction} · ISO8583`,
    `MTI = ${message.mti}`,
    ...message.fields.flatMap((field) => [
      `F${String(field.number).padStart(3, '0')} · ${isoFieldLabels[field.number]} = ${field.value.trim() || 'Vacío'}`,
      ...(field.tags?.map(
        (tag) =>
          `  ${tag.tag} · ${publicEmvTags[tag.tag]?.label ?? (tag.value === protectedIsoValue ? 'Dato protegido' : 'Tag EMV')} = ${tag.value}`,
      ) ?? []),
    ]),
  ].join('\n');
}
