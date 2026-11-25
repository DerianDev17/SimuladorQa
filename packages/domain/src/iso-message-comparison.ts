import { isoFieldLabels, protectedIsoValue, publicEmvTags, type IsoMessage } from './iso-message';

export type ComparisonStatus = 'equal' | 'changed' | 'added' | 'removed' | 'unverifiable';
export interface MessageComparisonRow {
  id: string;
  label: string;
  reference: string | undefined;
  current: string | undefined;
  status: ComparisonStatus;
  variable: boolean;
}
export interface ComparisonMessage {
  message: IsoMessage | undefined;
  complete: boolean;
}

// Literal diagnostic comparison, without financial interpretation or normalization.
// Missing messages are unavailable evidence, not proof that fields were removed.
export function compareIsoMessages(
  reference: ComparisonMessage,
  current: ComparisonMessage,
): MessageComparisonRow[] {
  const rows: MessageComparisonRow[] = [];
  function append(
    id: string,
    label: string,
    left: string | undefined,
    right: string | undefined,
    variable = false,
  ) {
    const masked = (value: string | undefined, complete: boolean) =>
      !complete &&
      value !== undefined &&
      (value.includes(protectedIsoValue) || /X{2,}|\*{3,}/.test(value));
    const status: ComparisonStatus =
      !reference.message || !current.message
        ? 'unverifiable'
        : left === undefined
          ? 'added'
          : right === undefined
            ? 'removed'
            : masked(left, reference.complete) || masked(right, current.complete)
              ? 'unverifiable'
              : left === right
                ? 'equal'
                : 'changed';
    rows.push({ id, label, reference: left, current: right, status, variable });
  }
  append('MTI', 'Tipo de mensaje', reference.message?.mti, current.message?.mti);
  const leftFields = new Map(reference.message?.fields.map((field) => [field.number, field]));
  const rightFields = new Map(current.message?.fields.map((field) => [field.number, field]));
  const numbers = [...new Set([...leftFields.keys(), ...rightFields.keys()])].sort((a, b) => a - b);
  for (const number of numbers) {
    const left = leftFields.get(number);
    const right = rightFields.get(number);
    append(
      `F${number}`,
      isoFieldLabels[number] ?? 'Campo',
      left?.value,
      right?.value,
      number === 11 || number === 37,
    );
    const leftTags = new Map(left?.tags?.map((tag) => [tag.tag, tag.value]));
    const rightTags = new Map(right?.tags?.map((tag) => [tag.tag, tag.value]));
    for (const tag of [...new Set([...leftTags.keys(), ...rightTags.keys()])].sort()) {
      append(
        `F${number}/${tag}`,
        publicEmvTags[tag]?.label ?? 'Tag EMV',
        leftTags.get(tag),
        rightTags.get(tag),
      );
    }
  }
  return rows;
}
