// A bounded projection from MDT_Journal/MDT_Message. SQL masks the card before
// any row crosses the database boundary; no account or XML is included.
export interface MediatorLiveRequest {
  mode: 'live';
  environment: 'PREPROD';
  entityId: 205;
  channelId: 1;
  limit: number;
}

export interface MediatorLiveRow {
  traceId: string;
  occurredAt: string | null;
  terminalId: string | null;
  terminalSequence: string | null;
  transactionCode: string | null;
  messageType: number | null;
  returnCode: number | null;
  cardMasked: string | null;
  valueText: string | null;
}

export interface MediatorLiveBatch {
  rows: MediatorLiveRow[];
  hasMore: boolean;
}

export interface MediatorLiveSnapshot extends MediatorLiveBatch {
  queriedAt: string;
}

export function parseMediatorLiveRequest(value: unknown): MediatorLiveRequest | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 5 ||
    record.mode !== 'live' ||
    record.environment !== 'PREPROD' ||
    record.entityId !== 205 ||
    record.channelId !== 1 ||
    typeof record.limit !== 'number' ||
    !Number.isInteger(record.limit) ||
    record.limit < 1 ||
    record.limit > 50
  )
    return undefined;
  return record as unknown as MediatorLiveRequest;
}
