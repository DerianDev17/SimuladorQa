import { isRecord } from './index';

// Public diagnostic projection only; never wire bytes or authentication data.
export interface IsoMessage {
  mti: '0200' | '0210' | '0420' | '0430';
  fields: { number: number; value: string; tags?: { tag: string; value: string }[] }[];
}
export interface TransactionMessages {
  request: IsoMessage;
  response?: IsoMessage;
}
export const protectedIsoValue = '••••••••';
export const isoFieldLabels: Readonly<Record<number, string>> = {
  2: 'PAN',
  3: 'Código de procesamiento',
  4: 'Monto',
  7: 'Fecha y hora de transmisión',
  11: 'STAN',
  12: 'Hora local',
  13: 'Fecha local',
  14: 'Vencimiento',
  15: 'Fecha de liquidación',
  18: 'Categoría de comercio',
  19: 'País adquirente',
  22: 'Modo de entrada',
  23: 'Secuencia de tarjeta',
  25: 'Condición POS',
  28: 'Comisión',
  32: 'Institución adquirente',
  35: 'Track 2',
  37: 'RRN',
  38: 'Código de autorización',
  39: 'Código de respuesta',
  41: 'Terminal ID',
  42: 'Identificación del comercio',
  43: 'Nombre y ubicación del comercio',
  44: 'Datos adicionales de respuesta',
  48: 'Datos adicionales privados',
  49: 'Moneda',
  52: 'PIN Block',
  53: 'Control de seguridad',
  54: 'Importes adicionales',
  55: 'Datos EMV',
  60: 'Datos privados F60',
  62: 'Datos privados F62',
  63: 'Datos privados F63',
  90: 'Datos de la transacción original',
  95: 'Importes de reemplazo',
};
// These public EMV values are already generated/validated by QaEmvOperation.
// Issuer data, cryptograms, authentication scripts and unknown tags stay masked.
export const publicEmvTags: Readonly<Record<string, { label: string; length: number }>> = {
  '82': { label: 'Perfil de intercambio (AIP)', length: 2 },
  '95': { label: 'Resultado de verificación (TVR)', length: 5 },
  '9A': { label: 'Fecha de transacción', length: 3 },
  '9C': { label: 'Tipo de transacción', length: 1 },
  '5F2A': { label: 'Moneda', length: 2 },
  '5F34': { label: 'Secuencia de tarjeta', length: 1 },
  '9F02': { label: 'Importe autorizado EMV', length: 6 },
  '9F03': { label: 'Otro importe EMV', length: 6 },
  '9F09': { label: 'Versión de aplicación terminal', length: 2 },
  '9F1A': { label: 'País del terminal', length: 2 },
  '9F33': { label: 'Capacidades del terminal', length: 3 },
  '9F34': { label: 'Resultado CVM', length: 3 },
  '9F35': { label: 'Tipo de terminal', length: 1 },
  '9F40': { label: 'Capacidades adicionales', length: 5 },
};
export function publicEmvValue(tag: string, value: string): string {
  const spec = publicEmvTags[tag];
  return spec && value.length === spec.length * 2 && /^[A-F0-9]+$/.test(value)
    ? value
    : protectedIsoValue;
}
// Closed display allowlist, independently checked at the persistence boundary.
const publicPatterns: Readonly<Record<number, RegExp>> = {
  2: /^\d{6}X{6}\d{4}$/,
  3: /^\d{6}$/,
  4: /^\d{12}$/,
  7: /^\d{10}$/,
  11: /^\d{6}$/,
  12: /^\d{6}$/,
  13: /^\d{4}$/,
  15: /^\d{4}$/,
  18: /^\d{4}$/,
  19: /^\d{3}$/,
  22: /^\d{4}$/,
  23: /^\d{3}$/,
  25: /^\d{2}$/,
  28: /^[CD]\d{8}$/,
  32: /^\d{1,11}$/,
  37: /^\d{12}$/,
  38: /^[A-Z0-9]{6}$/,
  39: /^\d{2}$/,
  41: /^[A-Z0-9]{8}$/,
  49: /^\d{3}$/,
  54: /^(?:\d{7}[CD]\d{12}){1,6}$/,
  90: /^\d{42}$/,
  95: /^\d{42}$/,
};
export function publicIsoValue(field: number, value: string): string {
  if ([42, 43, 44].includes(field)) {
    const maxLength = field === 42 ? 15 : field === 43 ? 40 : 25;
    if (!value.length || value.length > maxLength || !/^[A-Za-z0-9 .,*/:+_()-]+$/.test(value))
      return protectedIsoValue;
    // Merchant/host text is not a card-data channel. Also redact separated PANs.
    return value.replace(
      /\d(?:[ -]?\d){11,18}/g,
      (text) => '******' + text.replace(/\D/g, '').slice(-4),
    );
  }
  return publicPatterns[field]?.test(value) ? value : protectedIsoValue;
}
export function isPublicIsoField(field: number): boolean {
  return Object.hasOwn(publicPatterns, field) || [42, 43, 44].includes(field);
}
export function parseIsoMessage(value: unknown): IsoMessage | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !['0200', '0210', '0420', '0430'].includes(String(value.mti)) ||
    !Array.isArray(value.fields) ||
    !value.fields.length ||
    value.fields.length > 127
  )
    return undefined;
  let previous = 1;
  for (const field of value.fields) {
    if (
      !isRecord(field) ||
      Object.keys(field).length !== (Object.hasOwn(field, 'tags') ? 3 : 2) ||
      typeof field.number !== 'number' ||
      !Number.isInteger(field.number) ||
      field.number <= previous ||
      !Object.hasOwn(isoFieldLabels, field.number) ||
      typeof field.value !== 'string' ||
      (field.value !== protectedIsoValue &&
        publicIsoValue(field.number, field.value) !== field.value)
    )
      return undefined;
    if (Object.hasOwn(field, 'tags')) {
      if (
        field.number !== 55 ||
        !Array.isArray(field.tags) ||
        !field.tags.length ||
        field.tags.length > 64
      )
        return undefined;
      const seen = new Set<string>();
      for (const item of field.tags) {
        if (
          !isRecord(item) ||
          Object.keys(item).length !== 2 ||
          typeof item.tag !== 'string' ||
          !/^(?:[A-F0-9]{2}){1,3}$/.test(item.tag) ||
          seen.has(item.tag) ||
          typeof item.value !== 'string' ||
          (item.value !== protectedIsoValue && publicEmvValue(item.tag, item.value) !== item.value)
        )
          return undefined;
        seen.add(item.tag);
      }
    }
    previous = field.number;
  }
  return structuredClone(value) as unknown as IsoMessage;
}
export function parseTransactionMessages(value: unknown): TransactionMessages | undefined {
  return parseMessagePair(value, '0200', '0210');
}
export function parseReversalMessages(value: unknown): TransactionMessages | undefined {
  return parseMessagePair(value, '0420', '0430');
}
function parseMessagePair(
  value: unknown,
  requestMti: IsoMessage['mti'],
  responseMti: IsoMessage['mti'],
): TransactionMessages | undefined {
  if (!isRecord(value) || Object.keys(value).some((key) => !['request', 'response'].includes(key)))
    return undefined;
  const request = parseIsoMessage(value.request);
  const response = value.response === undefined ? undefined : parseIsoMessage(value.response);
  if (
    request?.mti !== requestMti ||
    (Object.hasOwn(value, 'response') && response?.mti !== responseMti)
  )
    return undefined;
  return { request, ...(response ? { response } : {}) };
}
