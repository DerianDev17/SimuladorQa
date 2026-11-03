import { catalogText, isRevision, isUtcTimestamp, isUuid } from './catalogs';
import { isRecord } from './index';
import { isRestrictedCaseText } from './saved-cases';
import { parseLoadRunDraft } from './load-run';
import type { LoadTestDraft } from './load-test';

export const LOAD_CONFIGURATION_LIMIT = 50;
export interface SavedLoadConfiguration {
  id: string;
  revision: number;
  name: string;
  draft: LoadTestDraft;
  createdAt: string;
  updatedAt: string;
}
export interface SaveLoadConfiguration {
  id: string | null;
  revision: number | null;
  name: string;
  draft: LoadTestDraft;
}
export interface DeleteLoadConfiguration {
  id: string;
  revision: number;
}
export function parseSaveLoadConfiguration(value: unknown): SaveLoadConfiguration | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    !['id', 'revision', 'name', 'draft'].every((key) => Object.hasOwn(value, key))
  )
    return;
  if (
    !(value.id === null && value.revision === null) &&
    !(isUuid(value.id) && isRevision(value.revision))
  )
    return;
  const name = catalogText(value.name, 80);
  const draft = parseLoadRunDraft(value.draft);
  if (!name || isRestrictedCaseText(name) || !draft) return;
  return { id: value.id as string | null, revision: value.revision as number | null, name, draft };
}
export function parseDeleteLoadConfiguration(value: unknown): DeleteLoadConfiguration | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !isUuid(value.id) ||
    !isRevision(value.revision)
  )
    return;
  return { id: value.id, revision: value.revision };
}
export function validSavedLoadConfiguration(value: unknown): value is SavedLoadConfiguration {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 6 ||
    !isUtcTimestamp(value.createdAt) ||
    !isUtcTimestamp(value.updatedAt) ||
    !isUuid(value.id) ||
    !isRevision(value.revision)
  )
    return false;
  return !!parseSaveLoadConfiguration({
    id: value.id,
    revision: value.revision,
    name: value.name,
    draft: value.draft,
  });
}
export function stressPreset(draft: LoadTestDraft, target: 3 | 5): LoadTestDraft {
  return {
    ...structuredClone(draft),
    mode: 'STRESS',
    targetTps: target,
    durationSeconds: 60,
    rampUpSeconds: 20,
    maxTransactions: 100,
    concurrency: draft.operation === 'WITHDRAWAL' ? 1 : 5,
  };
}
