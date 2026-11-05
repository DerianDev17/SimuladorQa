import {
  isoFieldLabels,
  publicEmvTags,
  type IsoMessage,
} from '../../../../packages/domain/src/iso-message';

// Format the public projection only. This is not a reconstruction of wire bytes.
export function formatIsoMessageText(message: IsoMessage): string {
  const direction = message.mti === '0210' || message.mti === '0430' ? 'RESP' : 'REQ';
  return [
    `${direction} · ISO8583`,
    `MTI = ${message.mti}`,
    ...message.fields.flatMap((field) => [
      `F${String(field.number).padStart(3, '0')} · ${isoFieldLabels[field.number]} = ${field.value.trim() || 'Vacío'}`,
      ...(field.tags?.map(
        (tag) =>
          `  ${tag.tag} · ${publicEmvTags[tag.tag]?.label ?? 'Dato protegido'} = ${tag.value}`,
      ) ?? []),
    ]),
  ].join('\n');
}
