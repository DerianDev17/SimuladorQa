import type { MessageContractReview } from '../../../../../packages/domain/src/observations';
import manifest from './cms-financial-fields.json' with { type: 'json' };

export const cmsFinancialFields = manifest.fields;
const elements = [
  'Campo',
  'ExtremeMsg',
  'ExtremeMsgReply',
  'Header',
  'Data',
  'FxTable',
  'HField',
  'DField',
];
const xmlTypes = ['b', 'i8', 'i16', 'i32', 'i64', 'f', 'd', 't'];
const sentinels = [
  '[Mensaje ausente o protegido por longitud]',
  '[Mensaje protegido: limite excedido]',
  '[Mensaje protegido: XML no validado]',
];
const names = new Set(cmsFinancialFields.flatMap((field) => [field.name, ...field.aliases]));
const financialCodes = new Set(['011000', '012000', '301000', '302000']);

export function supportsFinancialReview(code: string | null): boolean {
  return code !== null && financialCodes.has(code);
}

interface Token {
  kind: 'open' | 'close' | 'protected';
  tag: string;
  fieldName?: string;
  type?: string;
}

// Validate the bounded, redacted grammar before inspecting names and types.
// This parser never accepts raw XML values or a free attribute.
function tokenize(value: unknown): Token[] | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 16384) return undefined;
  if (sentinels.includes(value)) return [];
  const tokens: Token[] = [],
    stack: string[] = [];
  let cursor = 0,
    roots = 0;
  while (cursor < value.length) {
    if (tokens.length >= 1536) return undefined;
    if (value.startsWith('[PROTEGIDO]', cursor)) {
      if (!stack.length) return undefined;
      tokens.push({ kind: 'protected', tag: '' });
      cursor += '[PROTEGIDO]'.length;
      continue;
    }
    const match = value
      .slice(cursor)
      .match(/^<(\/)?([A-Za-z]+)(?: name="([^"]+)")?(?: type="([^"]+)")?>/);
    if (!match || !elements.includes(match[2]!)) return undefined;
    const [, closing, tag, fieldName, type] = match;
    if (fieldName !== undefined && !names.has(fieldName)) return undefined;
    if (
      type !== undefined &&
      (!xmlTypes.includes(type) || !fieldName || !['HField', 'DField'].includes(tag!))
    )
      return undefined;
    if (closing) {
      if (fieldName !== undefined || type !== undefined || stack.pop() !== tag) return undefined;
    } else {
      if (!stack.length && ++roots > 1) return undefined;
      stack.push(tag!);
      if (stack.length > 21) return undefined;
    }
    tokens.push({
      kind: closing ? 'close' : 'open',
      tag: tag!,
      ...(fieldName ? { fieldName } : {}),
      ...(type ? { type } : {}),
    });
    cursor += match[0].length;
  }
  return stack.length === 0 ? tokens : undefined;
}

export function isProtectedCmsStructure(value: unknown): boolean {
  return tokenize(value) !== undefined;
}

export function reviewFinancialStructure(
  value: string,
  direction: 'request' | 'response',
): MessageContractReview {
  const report: MessageContractReview = {
    status: 'UNAVAILABLE',
    requiredFieldCount: cmsFinancialFields.filter((field) => field.required.includes(direction))
      .length,
    missingRequired: [],
    aliases: [],
    typeDifferences: [],
    duplicates: [],
  };
  const tokens = tokenize(value);
  if (!tokens?.length || !['ExtremeMsg', 'ExtremeMsgReply'].includes(tokens[0]!.tag)) return report;
  const stack: string[] = [],
    observed = new Set<string>();
  report.status = 'REVIEWED';
  for (const token of tokens) {
    if (token.kind === 'close') {
      stack.pop();
      continue;
    }
    if (token.kind !== 'open') continue;
    const section = stack.at(-1);
    if (
      stack.length === 2 &&
      ((token.tag === 'HField' && section === 'Header') ||
        (token.tag === 'DField' && section === 'Data'))
    ) {
      const field = cmsFinancialFields.find(
        (item) =>
          item.section === section &&
          (item.name === token.fieldName || item.aliases.includes(token.fieldName ?? '')),
      );
      if (field) {
        const key = `${field.section}.${field.name}`;
        if (observed.has(key)) report.duplicates.push({ section: field.section, name: field.name });
        observed.add(key);
        if (field.name !== token.fieldName)
          report.aliases.push({
            section: field.section,
            observedName: token.fieldName!,
            documentedName: field.name,
          });
        if (token.type && token.type !== field.type)
          report.typeDifferences.push({
            section: field.section,
            name: field.name,
            observed: token.type,
            documented: field.type,
          });
      }
    }
    stack.push(token.tag);
  }
  report.missingRequired = cmsFinancialFields
    .filter(
      (field) =>
        field.required.includes(direction) && !observed.has(`${field.section}.${field.name}`),
    )
    .map(({ section, name }) => ({ section, name }));
  return report;
}
