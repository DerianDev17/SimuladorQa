import type { AccountType } from './transaction-draft';
import type { CardIdentityReading } from './card-reader';
import { isRecord } from './index';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const aliasPattern = /^[\p{L}\p{N} _.-]{2,40}$/u;
const aidPattern = /^(?:[A-F0-9]{2}){5,16}$/;
const labelPattern = /^[\p{L}\p{N} _./-]{1,32}$/u;
const accountTypes = new Set<AccountType>(['SAVINGS', 'CURRENT']);
const maximumProfiles = 100;

export function isValidCardProfileAlias(value: string): boolean {
  return aliasPattern.test(value.trim()) && !/(?:\d[\s-]*){12,}/.test(value);
}

export function suggestCardProfileAlias(identity: CardIdentityReading | undefined): string {
  if (identity?.status !== 'READ') return '';
  const lastFour = identity.panMasked?.match(/\d{4}$/)?.[0];
  const label = (identity.applicationLabel ?? 'Tarjeta QA')
    .replace(/[^\p{L}\p{N} _.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const candidate = `${label.slice(0, lastFour ? 33 : 40)}${lastFour ? ` - ${lastFour}` : ''}`;
  return isValidCardProfileAlias(candidate)
    ? candidate
    : `Tarjeta QA${lastFour ? ` - ${lastFour}` : ''}`;
}

export interface CardDataRequirements {
  cdol1: readonly { tag: string; length: number }[] | null;
  cdol2: readonly { tag: string; length: number }[] | null;
}

export interface SavedCardProfile {
  id: string;
  alias: string;
  lastFour: string | null;
  applicationId: string | null;
  applicationLabel: string | null;
  transactionDataRequirements: CardDataRequirements | null;
  defaultAccount: AccountType | null;
  savedAt: string;
  scope: 'QA_REFERENCE_ONLY';
}

export interface SavedCardProfileFile {
  version: 2;
  profiles: SavedCardProfile[];
}

export interface SaveCardProfileRequest {
  readId: string;
  alias: string;
  defaultAccount: AccountType | null;
}

export interface UpdateCardProfileRequest {
  id: string;
  alias: string;
  defaultAccount: AccountType | null;
}

export interface DeleteCardProfileRequest {
  id: string;
}

function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && accountTypes.has(value as AccountType);
}

function isOptionalAccountType(value: unknown): value is AccountType | null {
  return value === null || isAccountType(value);
}

function parseRequirements(value: unknown): CardDataRequirements | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || Object.keys(value).length !== 2) return undefined;
  const parseDol = (dol: unknown): { tag: string; length: number }[] | null | undefined => {
    if (dol === null) return null;
    if (!Array.isArray(dol) || dol.length > 32) return undefined;
    const entries = dol.map((entry) => {
      if (
        !isRecord(entry) ||
        Object.keys(entry).length !== 2 ||
        typeof entry.tag !== 'string' ||
        !/^(?:[A-F0-9]{2}){1,3}$/.test(entry.tag) ||
        !Number.isInteger(entry.length) ||
        (entry.length as number) < 1 ||
        (entry.length as number) > 128
      )
        return undefined;
      return { tag: entry.tag, length: entry.length as number };
    });
    if (entries.some((entry) => !entry)) return undefined;
    const parsed = entries as { tag: string; length: number }[];
    return new Set(parsed.map((entry) => entry.tag)).size === parsed.length ? parsed : undefined;
  };
  const cdol1 = parseDol(value.cdol1);
  const cdol2 = parseDol(value.cdol2);
  if (cdol1 === undefined || cdol2 === undefined) return undefined;
  return { cdol1, cdol2 };
}

export function parseSaveCardProfileRequest(value: unknown): SaveCardProfileRequest | undefined {
  if (
    !isRecord(value) ||
    (Object.keys(value).length !== 2 && Object.keys(value).length !== 3) ||
    Object.keys(value).some((key) => !['readId', 'alias', 'defaultAccount'].includes(key)) ||
    typeof value.readId !== 'string' ||
    !uuidPattern.test(value.readId) ||
    typeof value.alias !== 'string' ||
    !isValidCardProfileAlias(value.alias) ||
    (Object.hasOwn(value, 'defaultAccount') && !isOptionalAccountType(value.defaultAccount))
  )
    return undefined;
  return {
    readId: value.readId,
    alias: value.alias.trim(),
    defaultAccount: Object.hasOwn(value, 'defaultAccount')
      ? (value.defaultAccount as AccountType | null)
      : null,
  };
}

export function parseUpdateCardProfileRequest(
  value: unknown,
): UpdateCardProfileRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    typeof value.id !== 'string' ||
    !uuidPattern.test(value.id) ||
    typeof value.alias !== 'string' ||
    !isValidCardProfileAlias(value.alias) ||
    !Object.hasOwn(value, 'defaultAccount') ||
    !isOptionalAccountType(value.defaultAccount)
  )
    return undefined;
  return {
    id: value.id,
    alias: value.alias.trim(),
    defaultAccount: value.defaultAccount,
  };
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

function parseSavedCardProfile(value: unknown, legacy = false): SavedCardProfile | undefined {
  if (!isRecord(value)) return undefined;
  const expectedKeys = legacy
    ? ['id', 'alias', 'lastFour', 'applicationId', 'savedAt', 'scope']
    : [
        'id',
        'alias',
        'lastFour',
        'applicationId',
        'applicationLabel',
        'transactionDataRequirements',
        'defaultAccount',
        'savedAt',
        'scope',
      ];
  if (
    Object.keys(value).length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(value, key)) ||
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
    (!legacy &&
      !(
        value.applicationLabel === null ||
        (typeof value.applicationLabel === 'string' && labelPattern.test(value.applicationLabel)) ||
        (typeof value.applicationLabel === 'string' &&
          labelPattern.test(value.applicationLabel.trim()))
      )) ||
    (!legacy && parseRequirements(value.transactionDataRequirements) === undefined) ||
    (!legacy && !isOptionalAccountType(value.defaultAccount)) ||
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
    applicationLabel: legacy ? null : (value.applicationLabel as string | null),
    transactionDataRequirements: legacy
      ? null
      : parseRequirements(value.transactionDataRequirements)!,
    defaultAccount: legacy ? null : (value.defaultAccount as AccountType | null),
    savedAt: value.savedAt,
    scope: 'QA_REFERENCE_ONLY',
  };
}

export function parseSavedCardProfileFile(value: unknown): SavedCardProfileFile | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    (value.version !== 1 && value.version !== 2) ||
    !Array.isArray(value.profiles) ||
    value.profiles.length > maximumProfiles
  )
    return undefined;
  const legacy = value.version === 1;
  const profiles = value.profiles.map((profile) => parseSavedCardProfile(profile, legacy));
  if (profiles.some((profile) => !profile)) return undefined;
  const saved = profiles as SavedCardProfile[];
  if (new Set(saved.map((profile) => profile.id)).size !== saved.length) return undefined;
  return { version: 2, profiles: saved };
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
  const applicationLabel =
    reading.applicationLabel && labelPattern.test(reading.applicationLabel.trim())
      ? reading.applicationLabel.trim()
      : null;
  const transactionDataRequirements = parseRequirements(
    reading.transactionDataRequirements
      ? {
          cdol1: reading.transactionDataRequirements.cdol1,
          cdol2: reading.transactionDataRequirements.cdol2,
        }
      : null,
  );
  if (transactionDataRequirements === undefined) return undefined;
  return parseSavedCardProfile({
    id,
    alias: request.alias,
    lastFour,
    applicationId,
    applicationLabel,
    transactionDataRequirements,
    defaultAccount: request.defaultAccount,
    savedAt,
    scope: 'QA_REFERENCE_ONLY',
  });
}

export function updateSavedCardProfile(
  profile: SavedCardProfile,
  request: UpdateCardProfileRequest,
): SavedCardProfile | undefined {
  if (profile.id !== request.id) return undefined;
  return parseSavedCardProfile({
    ...profile,
    alias: request.alias,
    defaultAccount: request.defaultAccount,
  });
}

export const savedCardProfileLimits = { count: maximumProfiles } as const;
