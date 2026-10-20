import type { CardIdentityReading } from './card-reader';
import { isRecord } from './index';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const aliasPattern = /^[\p{L}\p{N} _.-]{2,40}$/u;
const aidPattern = /^(?:[A-F0-9]{2}){5,16}$/;
const maximumProfiles = 100;

export interface SavedCardProfile {
  id: string;
  alias: string;
  lastFour: string | null;
  applicationId: string | null;
  savedAt: string;
  scope: 'QA_REFERENCE_ONLY';
}

export interface SavedCardProfileFile {
  version: 1;
  profiles: SavedCardProfile[];
}

export interface SaveCardProfileRequest {
  readId: string;
  alias: string;
}

export interface DeleteCardProfileRequest {
  id: string;
}

export function parseSaveCardProfileRequest(value: unknown): SaveCardProfileRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    typeof value.readId !== 'string' ||
    !uuidPattern.test(value.readId) ||
    typeof value.alias !== 'string' ||
    !aliasPattern.test(value.alias.trim()) ||
    /(?:\d[\s-]*){12,}/.test(value.alias)
  )
    return undefined;
  return { readId: value.readId, alias: value.alias.trim() };
}

export function parseDeleteCardProfileRequest(
  value: unknown,
): DeleteCardProfileRequest | undefined {
  return isRecord(value) &&
    Object.keys(value).length === 1 &&
    typeof value.id === 'string' &&
    uuidPattern.test(value.id)
    ? { id: value.id }
    : undefined;
}

function parseSavedCardProfile(value: unknown): SavedCardProfile | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 6 ||
    typeof value.id !== 'string' ||
    !uuidPattern.test(value.id) ||
    typeof value.alias !== 'string' ||
    !aliasPattern.test(value.alias) ||
    /(?:\d[\s-]*){12,}/.test(value.alias) ||
    !(
      value.lastFour === null ||
      (typeof value.lastFour === 'string' && /^\d{4}$/.test(value.lastFour))
    ) ||
    !(
      value.applicationId === null ||
      (typeof value.applicationId === 'string' && aidPattern.test(value.applicationId))
    ) ||
    typeof value.savedAt !== 'string' ||
    Number.isNaN(Date.parse(value.savedAt)) ||
    new Date(value.savedAt).toISOString() !== value.savedAt ||
    value.scope !== 'QA_REFERENCE_ONLY'
  )
    return undefined;
  return {
    id: value.id,
    alias: value.alias,
    lastFour: value.lastFour,
    applicationId: value.applicationId,
    savedAt: value.savedAt,
    scope: 'QA_REFERENCE_ONLY',
  };
}

export function parseSavedCardProfileFile(value: unknown): SavedCardProfileFile | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    value.version !== 1 ||
    !Array.isArray(value.profiles) ||
    value.profiles.length > maximumProfiles
  )
    return undefined;
  const profiles = value.profiles.map(parseSavedCardProfile);
  if (profiles.some((profile) => !profile)) return undefined;
  const saved = profiles as SavedCardProfile[];
  if (new Set(saved.map((profile) => profile.id)).size !== saved.length) return undefined;
  return { version: 1, profiles: saved };
}

export function createSavedCardProfile(
  reading: CardIdentityReading,
  request: SaveCardProfileRequest,
  id: string,
  savedAt: string,
): SavedCardProfile | undefined {
  if (reading.status !== 'READ' || reading.readId !== request.readId) return undefined;
  const lastFour = reading.panMasked?.match(/\d{4}$/)?.[0] ?? null;
  const applicationId =
    reading.applicationId && aidPattern.test(reading.applicationId) ? reading.applicationId : null;
  return parseSavedCardProfile({
    id,
    alias: request.alias,
    lastFour,
    applicationId,
    savedAt,
    scope: 'QA_REFERENCE_ONLY',
  });
}

export const savedCardProfileLimits = { count: maximumProfiles } as const;
