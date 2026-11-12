import { catalogLimits, catalogText, isRevision, isUuid, type Entity } from './catalogs';
import { isRecord } from './index';
import { parseBalanceExecutionRequest, type BalanceExecutionRequest } from './balance-inquiry';

interface QaAtmIdentity {
  environment: 'QA';
  requestId: string;
  alias: string;
  terminalId: string;
}
export interface CreateTemplateQaAtmRequest extends QaAtmIdentity {
  templateId: string;
  templateRevision: number;
}
export interface CreateEntityQaAtmRequest extends QaAtmIdentity {
  entityId: string;
  entityRevision: number;
  acquirerId: string;
}
export type CreateQaAtmRequest = CreateTemplateQaAtmRequest | CreateEntityQaAtmRequest;
export interface QaAtmBalanceTestRequest {
  execution: BalanceExecutionRequest;
  entityId: string;
  entityRevision: number;
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
  entity?: Pick<
    Entity,
    'id' | 'revision' | 'code' | 'name' | 'networkType' | 'memberTypes' | 'active'
  >;
}
export function qaAtmEntityChecks(entity: Entity | undefined): AtmLocalInspection['checks'] {
  const classified = entity?.memberTypes?.length === 1;
  const supported = entity?.code === '205' && entity.networkType === 'COONECTA';
  return [
    {
      id: 'ENTITY',
      status: entity?.active ? 'VERIFIED' : 'ACTION_REQUIRED',
      label: entity?.active ? 'Entidad activa en el catálogo' : 'Entidad ausente o inactiva',
      action: entity?.active ? '' : 'Revisa la entidad en el catálogo.',
    },
    {
      id: 'CLASSIFICATION',
      status: classified ? 'VERIFIED' : 'ACTION_REQUIRED',
      label: classified
        ? 'Clasificación de entidad definida'
        : entity?.memberTypes?.length
          ? 'Clasificaciones múltiples: validación pendiente'
          : 'Entidad sin clasificar',
      action: classified
        ? ''
        : 'Valida la clasificación con la fuente responsable antes de probar saldo.',
    },
    {
      id: 'ENTITY_SCOPE',
      status: supported ? 'VERIFIED' : 'ACTION_REQUIRED',
      label: supported
        ? 'Entidad incluida en el alcance QA/205'
        : 'Falta configuración de saldo aprobada para esta entidad',
      action: supported
        ? ''
        : 'Se requiere perfil de saldo, adquirente, destino y seguridad aprobados para esta entidad. ATM20521 solo aplica a 205.',
    },
  ];
}
export function parseCreateQaAtm(value: unknown): CreateQaAtmRequest | undefined {
  if (!isRecord(value) || value.environment !== 'QA' || !isUuid(value.requestId)) return undefined;
  const alias = catalogText(value.alias, catalogLimits.text);
  const terminalId = catalogText(value.terminalId, catalogLimits.text);
  if (!alias || !terminalId || terminalId === 'ATM20521') return undefined;
  const identity: QaAtmIdentity = {
    environment: 'QA',
    requestId: value.requestId,
    alias,
    terminalId,
  };
  if ('templateId' in value) {
    if (
      Object.keys(value).length !== 6 ||
      !isUuid(value.templateId) ||
      !isRevision(value.templateRevision) ||
      !/^[A-Z0-9]{8}$/.test(terminalId)
    )
      return undefined;
    return { ...identity, templateId: value.templateId, templateRevision: value.templateRevision };
  }
  const acquirerId = catalogText(value.acquirerId, catalogLimits.text);
  if (
    Object.keys(value).length !== 7 ||
    !isUuid(value.entityId) ||
    !isRevision(value.entityRevision) ||
    !acquirerId
  )
    return undefined;
  return {
    ...identity,
    entityId: value.entityId,
    entityRevision: value.entityRevision,
    acquirerId,
  };
}
export function parseQaAtmBalanceTest(value: unknown): QaAtmBalanceTestRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    !isUuid(value.entityId) ||
    !isRevision(value.entityRevision)
  )
    return undefined;
  const execution = parseBalanceExecutionRequest(value.execution);
  return execution
    ? { execution, entityId: value.entityId, entityRevision: value.entityRevision }
    : undefined;
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
