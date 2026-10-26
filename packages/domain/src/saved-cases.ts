import { catalogText, isRestrictedCatalogText, isRevision, isUuid } from './catalogs';
import type { CatalogRecord, CatalogSnapshot } from './catalogs';
import { isEnvironment, isRecord, transactions } from './index';
import type { Environment } from './index';
import { needsOriginal, parseDraftRequest } from './transaction-draft';
import type { DraftRequest } from './transaction-draft';
import type { BalanceExecution } from './balance-inquiry';

export interface CaseExpectation {
  outcome: 'APPROVED' | 'NOT_APPROVED';
  responseCode: string | null;
  source: string;
}

export interface CaseValues {
  name: string;
  draft: DraftRequest;
  expectation?: CaseExpectation;
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

export function isRestrictedCaseText(value: string): boolean {
  return (
    isRestrictedCatalogText(value) ||
    /\b(?:PIN|CVV|CVC|ZPK|PASSWORD|TOKEN|SECRET|TRACK\s*2)\s*[:=\d]/i.test(value)
  );
}

export function parseCaseValues(value: unknown): CaseValues | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== (Object.hasOwn(value, 'expectation') ? 3 : 2) ||
    !Object.hasOwn(value, 'name') ||
    !Object.hasOwn(value, 'draft')
  )
    return undefined;
  const name = catalogText(value.name, 80);
  if (name && isRestrictedCaseText(name)) return undefined;
  const draft = parseDraftRequest(value.draft);
  if (!name || !draft) return undefined;
  if (!Object.hasOwn(value, 'expectation')) return { name, draft };
  const expectation = parseCaseExpectation(value.expectation);
  return expectation ? { name, draft, expectation } : undefined;
}

export function parseCaseExpectation(value: unknown): CaseExpectation | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    (value.outcome !== 'APPROVED' && value.outcome !== 'NOT_APPROVED') ||
    !(
      value.responseCode === null ||
      (typeof value.responseCode === 'string' &&
        /^[A-Za-z0-9 ]{2}$/.test(value.responseCode) &&
        value.responseCode.trim().length > 0)
    )
  )
    return undefined;
  const source = catalogText(value.source, 120);
  if (!source || isRestrictedCaseText(source)) return undefined;
  return {
    outcome: value.outcome,
    responseCode: value.responseCode as string | null,
    source,
  };
}

export interface CaseVerdict {
  status: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  reason: string;
  checks: readonly { field: string; expected: string; actual: string; pass: boolean }[];
}

export function caseMatchesDraft(saved: SavedCase, draft: DraftRequest): boolean {
  const original = saved.draft;
  return (
    original.environment === draft.environment &&
    original.transaction === draft.transaction &&
    original.scenario === draft.scenario &&
    original.atmId === draft.atmId &&
    original.atmRevision === draft.atmRevision &&
    original.account === draft.account &&
    original.amount === draft.amount
  );
}

// A verdict is a local comparison with an operator-declared expectation, never host certification.
export function evaluateCase(saved: SavedCase, execution: BalanceExecution): CaseVerdict {
  const expected = saved.expectation;
  const draft = saved.draft;
  if (!expected)
    return { status: 'INCONCLUSIVE', reason: 'El caso no tiene resultado esperado.', checks: [] };
  if (
    saved.environment !== execution.environment ||
    draft.environment !== execution.environment ||
    draft.atmId !== execution.atmId ||
    draft.atmRevision !== execution.atmRevision ||
    draft.scenario !== execution.scenario ||
    (draft.transaction === 'BALANCE' && draft.account !== 'SAVINGS') ||
    (draft.transaction !== 'BALANCE' &&
      draft.transaction !== 'WITHDRAWAL_APPROVED' &&
      draft.transaction !== 'WITHDRAWAL_DECLINED') ||
    (draft.transaction === 'BALANCE' && !!execution.withdrawal) ||
    (draft.transaction !== 'BALANCE' &&
      (execution.withdrawal?.transaction !== draft.transaction ||
        execution.withdrawal.amount !== draft.amount ||
        execution.withdrawal.account !== draft.account)) ||
    !!execution.reversal
  )
    return {
      status: 'INCONCLUSIVE',
      reason: 'La ejecución no corresponde al contexto del caso o incluye un reverso no evaluado.',
      checks: [],
    };
  if (
    !execution.finishedAt ||
    !execution.transmissionAttempted ||
    execution.bytesQueued <= 0 ||
    !execution.correlation ||
    !execution.responseCode ||
    !['APPROVED', 'NOT_APPROVED'].includes(execution.outcome)
  )
    return {
      status: 'INCONCLUSIVE',
      reason: 'Falta una respuesta financiera confirmada y correlacionada.',
      checks: [],
    };
  const checks = [
    {
      field: 'Resultado del host',
      expected: expected.outcome,
      actual: execution.outcome,
      pass: expected.outcome === execution.outcome,
    },
    ...(expected.responseCode === null
      ? []
      : [
          {
            field: 'Código de respuesta',
            expected: expected.responseCode,
            actual: execution.responseCode,
            pass: expected.responseCode === execution.responseCode,
          },
        ]),
  ];
  return {
    status: checks.every((check) => check.pass) ? 'PASS' : 'FAIL',
    reason: checks.every((check) => check.pass)
      ? 'La respuesta coincide con la expectativa declarada.'
      : 'La respuesta difiere de la expectativa declarada.',
    checks,
  };
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
