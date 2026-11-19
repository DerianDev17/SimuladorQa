import type { CatalogAudit } from '../../../../packages/domain/src/catalogs';
import { isUuid } from '../../../../packages/domain/src/catalogs';
import type { LoadConfigurationAudit } from '../../../../packages/domain/src/load-configurations';
import type { SendConfigurationAudit } from '../../../../packages/domain/src/send-configuration';
import type { AppSnapshot } from '../../../../packages/shared/src/contracts';

export const reportingOrigins = {
  transactions: 'Transacciones',
  load: 'Carga y estrés',
  ATM: 'Perfiles ATM',
  ENTITY: 'Entidades',
  CASE: 'Casos',
  send: 'Configuración',
  environment: 'Ambiente',
} as const;
export type ReportingOrigin = keyof typeof reportingOrigins;
export interface ReportingFilters {
  from: string;
  to: string;
  origin: string;
  atmId: string;
  query: string;
}
export const emptyReportingFilters: ReportingFilters = {
  from: '',
  to: '',
  origin: '',
  atmId: '',
  query: '',
};
export function validReportingFilters(filters: ReportingFilters): boolean {
  return (
    (!filters.from || Number.isFinite(Date.parse(filters.from))) &&
    (!filters.to || Number.isFinite(Date.parse(filters.to))) &&
    (!filters.from || !filters.to || Date.parse(filters.from) < Date.parse(filters.to)) &&
    (!filters.origin || Object.hasOwn(reportingOrigins, filters.origin)) &&
    (!filters.atmId || isUuid(filters.atmId)) &&
    filters.query.length <= 120
  );
}
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}
export function matchesReport(
  filters: ReportingFilters,
  item: { timestamp: string; origin: ReportingOrigin; atms?: readonly string[]; text: string },
): boolean {
  const time = Date.parse(item.timestamp);
  return (
    (!filters.from || time >= Date.parse(filters.from)) &&
    (!filters.to || time < Date.parse(filters.to)) &&
    (!filters.origin || filters.origin === item.origin) &&
    (!filters.atmId || !!item.atms?.includes(filters.atmId)) &&
    normalize(item.text).includes(normalize(filters.query))
  );
}
export interface AuditEntry {
  key: string;
  id: string;
  timestamp: string;
  origin: ReportingOrigin;
  action: string;
  resource: string;
  recordId: string;
  user: string;
  machine: string;
  details: string[];
  atmId?: string;
}
const actions = { CREATED: 'Creación', UPDATED: 'Actualización', DELETED: 'Eliminación' };
const ms = (value: number | null) => (value === null ? 'Pendiente' : `${value} ms`);
export function reportingAudit(sources: {
  catalog?: readonly CatalogAudit[];
  send?: readonly SendConfigurationAudit[];
  environment?: AppSnapshot['audit'];
  load?: readonly LoadConfigurationAudit[];
}): AuditEntry[] {
  const entries: AuditEntry[] = [];
  for (const item of sources.catalog ?? [])
    entries.push({
      key: `catalog:${item.id}`,
      id: item.id,
      timestamp: item.timestamp,
      origin: item.resource,
      action: actions[item.action],
      resource: { ENTITY: 'Entidad', ATM: 'Perfil ATM', CASE: 'Caso' }[item.resource],
      recordId: item.recordId,
      user: item.user,
      machine: item.machine,
      details: ['Este evento conserva la acción y el recurso, sin los valores del formulario.'],
      ...(item.resource === 'ATM' ? { atmId: item.recordId } : {}),
    });
  for (const item of sources.send ?? [])
    entries.push({
      key: `send:${item.id}`,
      id: item.id,
      timestamp: item.timestamp,
      origin: 'send',
      action: 'Guardado',
      resource: `Configuración de envío · Revisión ${item.revision}`,
      recordId: item.configurationId,
      user: item.user,
      machine: item.machine,
      details: item.settings
        ? [
            `${item.settings.endpoint.host}:${item.settings.endpoint.port}`,
            `Conexión: ${ms(item.settings.connectDeadlineMs)}`,
            `Respuesta: ${ms(item.settings.observationWindowMs)}`,
          ]
        : ['Detalle no disponible en este registro anterior'],
    });
  for (const item of sources.load ?? [])
    entries.push({
      key: `load:${item.id}`,
      id: item.id,
      timestamp: item.timestamp,
      origin: 'load',
      action: actions[item.action],
      resource: `Configuración de carga · Revisión ${item.revision}`,
      recordId: item.configurationId,
      user: item.user,
      machine: item.machine,
      details: ['Este evento no conserva los parámetros históricos de la configuración.'],
    });
  for (const item of sources.environment ?? [])
    entries.push({
      key: `environment:${item.id}`,
      id: item.id,
      timestamp: item.timestamp,
      origin: 'environment',
      action: 'Cambio',
      resource: 'Ambiente de la estación',
      recordId: item.id,
      user: item.user,
      machine: item.machine,
      details: [
        `${item.previousEnvironment === 'QA' ? 'Qa' : 'Configuración anterior'} → ${item.environment === 'QA' ? 'Qa' : 'Configuración anterior'}`,
      ],
    });
  return entries.sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp) || a.key.localeCompare(b.key),
  );
}
export function filterAudit(
  entries: readonly AuditEntry[],
  filters: ReportingFilters,
): AuditEntry[] {
  return entries.filter((entry) =>
    matchesReport(filters, {
      timestamp: entry.timestamp,
      origin: entry.origin,
      atms: entry.atmId ? [entry.atmId] : [],
      text: [
        entry.id,
        entry.recordId,
        entry.resource,
        entry.user,
        entry.machine,
        entry.action,
        reportingOrigins[entry.origin],
      ].join(' '),
    }),
  );
}
