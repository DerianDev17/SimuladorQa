import { isEnvironment, isRecord } from './index';
import type { Environment } from './index';

export const networkTypes = ['COONECTA', 'BANRED', 'EXTERNAL'] as const;
export type NetworkType = (typeof networkTypes)[number];
export const catalogLimits = { code: 64, text: 128 } as const;

export interface EntityValues {
  code: string;
  name: string;
  networkType: NetworkType;
  active: boolean;
}
export interface AtmValues {
  alias: string;
  entityId: string;
  terminalId: string;
  acquirerId: string;
  active: boolean;
}
export interface CatalogRecord {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  status: 'DRAFT';
}
export interface Entity extends CatalogRecord, EntityValues {}
export interface AtmProfile extends CatalogRecord, AtmValues {
  environment: Environment;
}
export interface SaveRequest<T> {
  environment: Environment;
  id: string | null;
  revision: number | null;
  values: T;
}
export type SaveEntityRequest = SaveRequest<EntityValues>;
export type SaveAtmRequest = SaveRequest<AtmValues>;
export interface DeleteRequest {
  environment: Environment;
  id: string;
  revision: number;
}
export type CatalogAction = 'CREATED' | 'UPDATED' | 'DELETED';
export interface CatalogAudit {
  id: string;
  timestamp: string;
  environment: Environment;
  user: string;
  machine: string;
  resource: 'ENTITY' | 'ATM';
  recordId: string;
  action: CatalogAction;
}
export interface CatalogSnapshot {
  environment: Environment;
  entities: Entity[];
  atms: AtmProfile[];
  audit: CatalogAudit[];
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
export function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}
export function isUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function hasKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

// Límites administrativos y protección de datos; no valida formatos ISO.
export function isRestrictedCatalogText(value: string): boolean {
  return (
    /\d{12,}/.test(value) ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  );
}
export function catalogText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string' || value.length > maximum || isRestrictedCatalogText(value))
    return undefined;
  const text = value.trim();
  return text.length ? text : undefined;
}
export function parseEntityValues(value: unknown): EntityValues | undefined {
  if (!isRecord(value) || !hasKeys(value, ['code', 'name', 'networkType', 'active']))
    return undefined;
  const code = catalogText(value.code, catalogLimits.code);
  const name = catalogText(value.name, catalogLimits.text);
  const networkType = networkTypes.find((type) => type === value.networkType);
  return code && name && networkType && typeof value.active === 'boolean'
    ? { code, name, networkType, active: value.active }
    : undefined;
}
export function parseAtmValues(value: unknown): AtmValues | undefined {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['alias', 'entityId', 'terminalId', 'acquirerId', 'active'])
  )
    return undefined;
  const alias = catalogText(value.alias, catalogLimits.text);
  const terminalId = catalogText(value.terminalId, catalogLimits.text);
  const acquirerId = catalogText(value.acquirerId, catalogLimits.text);
  return alias &&
    terminalId &&
    acquirerId &&
    isUuid(value.entityId) &&
    typeof value.active === 'boolean'
    ? { alias, entityId: value.entityId, terminalId, acquirerId, active: value.active }
    : undefined;
}
function parseSaveRequest<T>(
  value: unknown,
  parseValues: (values: unknown) => T | undefined,
): SaveRequest<T> | undefined {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['environment', 'id', 'revision', 'values']) ||
    !isEnvironment(value.environment)
  )
    return undefined;
  if (
    !(value.id === null && value.revision === null) &&
    !(isUuid(value.id) && isRevision(value.revision))
  )
    return undefined;
  const values = parseValues(value.values);
  return values
    ? {
        environment: value.environment,
        id: value.id as string | null,
        revision: value.revision as number | null,
        values,
      }
    : undefined;
}
export function parseSaveEntityRequest(value: unknown): SaveEntityRequest | undefined {
  return parseSaveRequest(value, parseEntityValues);
}
export function parseSaveAtmRequest(value: unknown): SaveAtmRequest | undefined {
  return parseSaveRequest(value, parseAtmValues);
}
export function parseDeleteRequest(value: unknown): DeleteRequest | undefined {
  return isRecord(value) &&
    hasKeys(value, ['environment', 'id', 'revision']) &&
    isEnvironment(value.environment) &&
    isUuid(value.id) &&
    isRevision(value.revision)
    ? { environment: value.environment, id: value.id, revision: value.revision }
    : undefined;
}

export function selectableAtms(catalog: CatalogSnapshot): AtmProfile[] {
  const activeEntities = new Set(
    catalog.entities.filter((entity) => entity.active).map((entity) => entity.id),
  );
  return catalog.atms.filter(
    (atm) =>
      atm.environment === catalog.environment && atm.active && activeEntities.has(atm.entityId),
  );
}
