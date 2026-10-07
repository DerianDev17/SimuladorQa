import type { Environment } from './index';

export interface ObservationRequest {
  environment: Environment;
  entityId: number;
  channelId: number;
  from: string;
  to: string;
  terminalId: string;
  transactionCode: string;
  terminalSequence: string;
  returnCode: string;
  limit: number;
}

export interface ObservedTransaction {
  traceId: string;
  terminalId: string | null;
  terminalSequence: string | null;
  occurredAt: string | null;
  transactionCode: string | null;
  messageType: number | null;
  returnCode: number | null;
  requestStructure: string;
  responseStructure: string;
}

export interface ObservationBatch {
  rows: ObservedTransaction[];
  hasMore: boolean;
}

export interface ObservationSearch extends ObservationBatch {
  queryId: string;
  queriedAt: string;
}

// Las fechas SQL no tienen zona documentada. Este cálculo valida calendario e intervalo,
// pero no convierte la hora de negocio a UTC.
function sqlDate(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}$/.test(value))
    return undefined;
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, -1).replace('T', ' ') !== value
  )
    return undefined;
  // Rango documentado del tipo SQL datetime; evita redondeo al día siguiente.
  if (value < '1753-01-01 00:00:00.000' || value > '9999-12-31 23:59:59.997') return undefined;
  return date.getTime();
}

export function parseObservationRequest(payload: unknown): ObservationRequest | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const value = payload as Record<string, unknown>;
  const keys = [
    'environment',
    'entityId',
    'channelId',
    'from',
    'to',
    'terminalId',
    'transactionCode',
    'terminalSequence',
    'returnCode',
    'limit',
  ];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value)))
    return undefined;
  if (value.environment !== 'QA' && value.environment !== 'PREPROD') return undefined;
  for (const key of ['entityId', 'channelId']) {
    if (
      typeof value[key] !== 'number' ||
      !Number.isInteger(value[key]) ||
      value[key] < 0 ||
      value[key] > 32767
    )
      return undefined;
  }
  const from = sqlDate(value.from);
  const to = sqlDate(value.to);
  if (from === undefined || to === undefined || to < from || to - from > 86_400_000)
    return undefined;
  if (typeof value.terminalId !== 'string' || !/^[A-Za-z0-9_-]{0,10}$/.test(value.terminalId))
    return undefined;
  if (typeof value.transactionCode !== 'string' || !/^(?:\d{6})?$/.test(value.transactionCode))
    return undefined;
  if (typeof value.terminalSequence !== 'string' || !/^(?:\d{1,19})?$/.test(value.terminalSequence))
    return undefined;
  if (value.terminalSequence && BigInt(value.terminalSequence) > (1n << 63n) - 1n) return undefined;
  if (typeof value.returnCode !== 'string' || !/^(?:-?\d{1,10})?$/.test(value.returnCode))
    return undefined;
  if (
    value.returnCode &&
    (BigInt(value.returnCode) < -2147483648n || BigInt(value.returnCode) > 2147483647n)
  )
    return undefined;
  if (
    typeof value.limit !== 'number' ||
    !Number.isInteger(value.limit) ||
    value.limit < 1 ||
    value.limit > 100
  )
    return undefined;
  return {
    environment: value.environment,
    entityId: value.entityId as number,
    channelId: value.channelId as number,
    from: value.from as string,
    to: value.to as string,
    terminalId: value.terminalId,
    transactionCode: value.transactionCode,
    terminalSequence: value.terminalSequence,
    returnCode: value.returnCode,
    limit: value.limit,
  };
}
