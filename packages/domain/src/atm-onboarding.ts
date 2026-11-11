import { catalogLimits, catalogText, isRevision, isUuid } from './catalogs';
import { isRecord } from './index';

export interface CreateQaAtmRequest {
  environment: 'QA';
  requestId: string;
  templateId: string;
  templateRevision: number;
  alias: string;
  terminalId: string;
}
export interface InspectQaAtmRequest {
  environment: 'QA';
  atmId: string;
  revision: number;
}
export interface AtmLocalInspection {
  atmId: string;
  revision: number;
  checkedAt: string;
  configurationRevision: number | null;
  checks: readonly {
    id: string;
    status: 'VERIFIED' | 'ACTION_REQUIRED' | 'NOT_CHECKED';
    label: string;
    action: string;
  }[];
  readyForBalanceTest: boolean;
  source?: 'SPECIFIC' | 'ATM20521';
  sequencesRemaining?: number;
}
export function parseCreateQaAtm(value: unknown): CreateQaAtmRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 6 ||
    value.environment !== 'QA' ||
    !isUuid(value.requestId) ||
    !isUuid(value.templateId) ||
    !isRevision(value.templateRevision)
  )
    return undefined;
  const alias = catalogText(value.alias, catalogLimits.text);
  const terminalId = catalogText(value.terminalId, 8);
  if (!alias || !terminalId || !/^[A-Z0-9]{8}$/.test(terminalId) || terminalId === 'ATM20521')
    return undefined;
  return {
    environment: 'QA',
    requestId: value.requestId,
    templateId: value.templateId,
    templateRevision: value.templateRevision,
    alias,
    terminalId,
  };
}
export function parseInspectQaAtm(value: unknown): InspectQaAtmRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    value.environment !== 'QA' ||
    !isUuid(value.atmId) ||
    !isRevision(value.revision)
  )
    return undefined;
  return { environment: 'QA', atmId: value.atmId, revision: value.revision };
}
