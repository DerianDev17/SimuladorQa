import { isEnvironment, isRecord } from './index';
import type { Environment } from './index';
import { isUuid, isRevision } from './catalogs';
import type { NetworkEvidence } from './network-evidence';

export type SendTrigger = 'ON_CLICK' | 'AFTER_REVIEW';
export interface SendConfigurationValues {
  evidenceId: string;
  trigger: SendTrigger;
  connectDeadlineMs: number | null;
  observationWindowMs: number | null;
}
export interface SendConfiguration extends SendConfigurationValues {
  id: string;
  environment: Environment;
  revision: number;
  updatedAt: string;
  endpoint: { host: string; port: number };
}
export interface SaveSendConfigurationRequest {
  environment: Environment;
  revision: number | null;
  values: SendConfigurationValues;
}
export interface SendConfigurationAudit {
  id: string;
  timestamp: string;
  environment: Environment;
  configurationId: string;
  revision: number;
  user: string;
  machine: string;
}
export interface SendConfigurationFile {
  version: 1;
  configurations: SendConfiguration[];
  audit: SendConfigurationAudit[];
}
export interface SendConfigurationSnapshot {
  environment: Environment;
  configuration: SendConfiguration | null;
  documentedEndpoint: { host: string; port: number; evidenceId: string } | null;
  status: 'NOT_CONFIGURED' | 'CONFIGURED_BLOCKED' | 'SOURCE_CHANGED';
  pending: readonly { id: string; label: string }[];
}
function keys(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((key) => Object.hasOwn(value, key))
  );
}
function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function deadline(value: unknown): value is number | null {
  // Technical limits of the existing single-write QA transport, not provider timeouts.
  return (
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 30000)
  );
}
function endpoint(value: unknown): value is SendConfiguration['endpoint'] {
  if (
    !keys(value, ['host', 'port']) ||
    typeof value.host !== 'string' ||
    typeof value.port !== 'number' ||
    !Number.isInteger(value.port) ||
    value.port < 1 ||
    value.port > 65535
  )
    return false;
  const parts = value.host.split('.');
  return (
    parts.length === 4 &&
    parts.every(
      (part) => /^\d{1,3}$/.test(part) && Number(part) <= 255 && String(Number(part)) === part,
    )
  );
}
export function parseSendConfigurationValues(value: unknown): SendConfigurationValues | undefined {
  if (
    !keys(value, ['evidenceId', 'trigger', 'connectDeadlineMs', 'observationWindowMs']) ||
    !isUuid(value.evidenceId) ||
    (value.trigger !== 'ON_CLICK' && value.trigger !== 'AFTER_REVIEW') ||
    !deadline(value.connectDeadlineMs) ||
    !deadline(value.observationWindowMs)
  )
    return undefined;
  return {
    evidenceId: value.evidenceId,
    trigger: value.trigger,
    connectDeadlineMs: value.connectDeadlineMs,
    observationWindowMs: value.observationWindowMs,
  };
}
export function parseSaveSendConfiguration(
  value: unknown,
): SaveSendConfigurationRequest | undefined {
  if (
    !keys(value, ['environment', 'revision', 'values']) ||
    !isEnvironment(value.environment) ||
    !(value.revision === null || isRevision(value.revision))
  )
    return undefined;
  const values = parseSendConfigurationValues(value.values);
  return values
    ? { environment: value.environment, revision: value.revision as number | null, values }
    : undefined;
}
export function parseSendConfigurationFile(value: unknown): SendConfigurationFile | undefined {
  if (
    !keys(value, ['version', 'configurations', 'audit']) ||
    value.version !== 1 ||
    !Array.isArray(value.configurations) ||
    value.configurations.length > 2 ||
    !Array.isArray(value.audit) ||
    value.audit.length > 100
  )
    return undefined;
  const environments = new Set<string>();
  for (const item of value.configurations) {
    if (
      !keys(item, [
        'id',
        'environment',
        'revision',
        'updatedAt',
        'endpoint',
        'evidenceId',
        'trigger',
        'connectDeadlineMs',
        'observationWindowMs',
      ]) ||
      !isUuid(item.id) ||
      !isEnvironment(item.environment) ||
      !isRevision(item.revision) ||
      !utc(item.updatedAt) ||
      !endpoint(item.endpoint) ||
      !parseSendConfigurationValues({
        evidenceId: item.evidenceId,
        trigger: item.trigger,
        connectDeadlineMs: item.connectDeadlineMs,
        observationWindowMs: item.observationWindowMs,
      }) ||
      environments.has(item.environment)
    )
      return undefined;
    environments.add(item.environment);
  }
  for (const item of value.audit) {
    if (
      !keys(item, [
        'id',
        'timestamp',
        'environment',
        'configurationId',
        'revision',
        'user',
        'machine',
      ]) ||
      !isUuid(item.id) ||
      !isUuid(item.configurationId) ||
      !isRevision(item.revision) ||
      !isEnvironment(item.environment) ||
      !utc(item.timestamp) ||
      typeof item.user !== 'string' ||
      !item.user.length ||
      item.user.length > 256 ||
      typeof item.machine !== 'string' ||
      !item.machine.length ||
      item.machine.length > 256 ||
      Array.from(item.user + item.machine).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return undefined;
  }
  return structuredClone(value) as unknown as SendConfigurationFile;
}
export function sendConfigurationSnapshot(
  environment: Environment,
  configuration: SendConfiguration | undefined,
  evidence: NetworkEvidence | undefined,
): SendConfigurationSnapshot {
  const source = evidence?.environment === environment ? evidence : undefined;
  const matches =
    !!configuration &&
    !!source &&
    configuration.environment === environment &&
    configuration.evidenceId === source.id &&
    configuration.endpoint.host === source.ingress.host &&
    configuration.endpoint.port === source.ingress.port;
  const pending: { id: string; label: string }[] = [];
  if (!source) pending.push({ id: 'ENVIRONMENT', label: 'Destino documentado para este ambiente' });
  if (!configuration)
    pending.push({ id: 'SEND-CONFIGURATION', label: 'Guardar la configuración de envío' });
  if (configuration && !matches)
    pending.push({
      id: 'SEND-SOURCE-CHANGED',
      label: 'Actualizar la configuración con el destino vigente',
    });
  if (!configuration?.connectDeadlineMs || !configuration?.observationWindowMs)
    pending.push({ id: 'SEND-DEADLINES', label: 'Definir los plazos del intento' });
  if (environment !== 'QA')
    pending.push({ id: 'ENVIRONMENT', label: 'Transporte ejecutable PREPROD aprobado' });
  pending.push(
    { id: 'AUTOMATIC-FRAME-GENERATOR', label: 'Reglas aprobadas para generar una trama nueva' },
    { id: 'CARD-TRANSACTION-SECURITY', label: 'Perfil de tarjeta y seguridad PIN/EMV' },
  );
  return {
    environment,
    configuration: configuration ? structuredClone(configuration) : null,
    documentedEndpoint: source ? { ...source.ingress, evidenceId: source.id } : null,
    status: !configuration ? 'NOT_CONFIGURED' : matches ? 'CONFIGURED_BLOCKED' : 'SOURCE_CHANGED',
    pending,
  };
}
