import { isRecord } from './index';
import { isRevision, isUuid } from './catalogs';
import { parseDraftRequest, type DraftRequest } from './transaction-draft';

export interface FinancialContextRequest {
  draft: DraftRequest;
  configurationRevision: number;
  cardReadId: string;
}

// Shared input checks only. Each operation still validates its transaction,
// scenario and amount; accepting this context does not authorize transmission.
export function parseQaSavingsContextRequest(value: unknown): FinancialContextRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    !isRevision(value.configurationRevision) ||
    !isUuid(value.cardReadId)
  )
    return undefined;
  const draft = parseDraftRequest(value.draft);
  if (
    !draft ||
    draft.environment !== 'QA' ||
    draft.account !== 'SAVINGS' ||
    draft.atmId === null ||
    draft.atmRevision === null
  )
    return undefined;
  return {
    draft,
    configurationRevision: value.configurationRevision,
    cardReadId: value.cardReadId,
  };
}
