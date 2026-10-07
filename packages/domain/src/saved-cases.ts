import { catalogText, isRevision, isUuid } from './catalogs';
import type { CatalogRecord, CatalogSnapshot } from './catalogs';
import { isEnvironment, isRecord, transactions } from './index';
import type { Environment } from './index';
import { needsOriginal, parseDraftRequest } from './transaction-draft';
import type { DraftRequest } from './transaction-draft';

export interface CaseValues {
  name: string;
  draft: DraftRequest;
}
export interface SaveCaseRequest {
  environment: Environment;
  id: string | null;
  revision: number | null;
  values: CaseValues;
}
export interface SavedCase extends CatalogRecord, CaseValues {
  environment: Environment;
  evidenceDocuments: readonly string[];
}

export function parseCaseValues(value: unknown): CaseValues | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'name') ||
    !Object.hasOwn(value, 'draft')
  )
    return undefined;
  const name = catalogText(value.name, 80);
  if (name && /\b(?:PIN|CVV|CVC|ZPK|PASSWORD|TOKEN|SECRET|TRACK\s*2)\s*[:=\d]/i.test(name))
    return undefined;
  const draft = parseDraftRequest(value.draft);
  return name && draft ? { name, draft } : undefined;
}

export function parseSaveCaseRequest(value: unknown): SaveCaseRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    !['environment', 'id', 'revision', 'values'].every((key) => Object.hasOwn(value, key)) ||
    !isEnvironment(value.environment) ||
    !(
      (value.id === null && value.revision === null) ||
      (isUuid(value.id) && isRevision(value.revision))
    )
  )
    return undefined;
  const values = parseCaseValues(value.values);
  return values && values.draft.environment === value.environment
    ? {
        environment: value.environment,
        id: value.id as string | null,
        revision: value.revision as number | null,
        values,
      }
    : undefined;
}

// Referencias documentales públicas; nunca evidencia de una ejecución ni payload ISO.
export function caseEvidenceDocuments(draft: DraftRequest): readonly string[] {
  const specification = transactions.find((item) => item.id === draft.transaction)!.document;
  return [
    specification,
    'docs/INPUT_CHECKLIST.md',
    ...(needsOriginal(draft.transaction) ? [] : ['docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md']),
    'docs/protocols/PCAP_REVIEW.md',
  ];
}

// Se conserva la revisión original. Un perfil editado requiere selección explícita.
export function caseAtmAvailable(saved: SavedCase, catalog: CatalogSnapshot): boolean {
  if (saved.environment !== catalog.environment) return false;
  if (saved.draft.atmId === null) return true;
  const atm = catalog.atms.find((item) => item.id === saved.draft.atmId);
  return (
    !!atm &&
    atm.environment === saved.environment &&
    atm.active &&
    atm.revision === saved.draft.atmRevision &&
    catalog.entities.some((entity) => entity.id === atm.entityId && entity.active)
  );
}
