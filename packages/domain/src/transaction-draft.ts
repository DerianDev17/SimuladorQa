import {
  dataBlockers,
  isEnvironment,
  isRecord,
  parsePreparationRequest,
  transactions,
} from './index';
import type { DataBlocker, Environment, PreparationRequest, TransactionType } from './index';
import { isRevision, isUuid, selectableAtms } from './catalogs';
import type { CatalogSnapshot } from './catalogs';
import type { DestinationCompatibility, DestinationInspector } from './destination-compatibility';

export const accountTypes = [
  { id: 'SAVINGS', label: 'Ahorros' },
  { id: 'CURRENT', label: 'Corriente' },
] as const;
export type AccountType = (typeof accountTypes)[number]['id'];

// Metadatos de una fuente externa, nunca una regla de packing ISO del dominio.
export interface DocumentedOperation {
  transaction: TransactionType;
  account: AccountType;
  code: string;
  accountCode: string;
  source: { title: string; version: string; page: number; document: string };
}
export interface OperationCatalog {
  readonly entries: readonly DocumentedOperation[];
}
export interface DraftRequest extends PreparationRequest {
  environment: Environment;
  atmId: string | null;
  atmRevision: number | null;
  account: AccountType | null;
  amount: string | null;
}
export interface DraftReview {
  environment: Environment;
  transaction: TransactionType;
  scenario: PreparationRequest['scenario'];
  status: 'BLOCKED';
  atm: { id: string; revision: number; alias: string; status: 'DRAFT' } | null;
  amount: string | null;
  operation: DocumentedOperation | null;
  account: AccountType | null;
  blockers: readonly DataBlocker[];
  specification: string;
  destinationCompatibility: DestinationCompatibility | null;
}
export function needsOriginal(transaction: TransactionType): boolean {
  return transaction === 'REVERSAL' || transaction === 'TIMEOUT_REVERSAL';
}
export function needsAmount(transaction: TransactionType): boolean {
  return transaction === 'WITHDRAWAL_APPROVED' || transaction === 'WITHDRAWAL_DECLINED';
}

// Limite tecnico del borrador: 11 digitos enteros y dos decimales.
// No valida limites, denominaciones ni elegibilidad financiera.
export function isDraftAmount(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d{0,10})\.\d{2}$/.test(value);
}
export function parseDraftRequest(value: unknown): DraftRequest | undefined {
  const keys = [
    'environment',
    'transaction',
    'scenario',
    'atmId',
    'atmRevision',
    'account',
    'amount',
  ];
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key)) ||
    !isEnvironment(value.environment) ||
    !(
      (value.atmId === null && value.atmRevision === null) ||
      (isUuid(value.atmId) && isRevision(value.atmRevision))
    )
  )
    return undefined;
  const preparation = parsePreparationRequest({
    transaction: value.transaction,
    scenario: value.scenario,
  });
  if (!preparation) return undefined;
  const account = accountTypes.find((item) => item.id === value.account)?.id;
  if (needsOriginal(preparation.transaction) ? value.account !== null : !account) return undefined;
  if (needsAmount(preparation.transaction) ? !isDraftAmount(value.amount) : value.amount !== null)
    return undefined;
  return {
    ...preparation,
    environment: value.environment,
    atmId: value.atmId as string | null,
    atmRevision: value.atmRevision as number | null,
    account: account ?? null,
    amount: value.amount as string | null,
  };
}

export function reviewDraft(
  request: DraftRequest,
  catalog: CatalogSnapshot,
  operations: OperationCatalog,
  inspector?: DestinationInspector,
): DraftReview | undefined {
  if (!parseDraftRequest(request) || catalog.environment !== request.environment) return undefined;
  const atm = selectableAtms(catalog).find((item) => item.id === request.atmId);
  if (request.atmId !== null && (!atm || atm.revision !== request.atmRevision)) return undefined;
  const operation =
    operations.entries.find(
      (item) => item.transaction === request.transaction && item.account === request.account,
    ) ?? null;
  const blockers = draftBlockers(request.transaction, !!operation);
  const specification = transactions.find((item) => item.id === request.transaction)?.document;
  if (!specification) return undefined;
  return {
    environment: request.environment,
    transaction: request.transaction,
    scenario: request.scenario,
    status: 'BLOCKED',
    atm: atm ? { id: atm.id, revision: atm.revision, alias: atm.alias, status: atm.status } : null,
    amount: request.amount,
    account: request.account,
    operation,
    blockers,
    specification,
    destinationCompatibility:
      inspector?.assess({
        environment: request.environment,
        terminalId: atm?.terminalId ?? null,
        operationCode: operation?.code ?? null,
      }) ?? null,
  };
}

// Los mismos requisitos antes y despues de revisar; elegir una plantilla no los completa.
export function draftBlockers(
  transaction: TransactionType,
  operationAvailable: boolean,
): readonly DataBlocker[] {
  const blockers: DataBlocker[] = [...dataBlockers];
  if (needsOriginal(transaction))
    blockers.push({
      id: 'ORIGINAL_TRANSACTION',
      label: 'Transacción original y reglas de reverso',
      description: 'Faltan original validado, MTI, campos de correlación y política de timeout.',
      document: 'docs/transactions/REVERSAL.md',
    });
  else if (!operationAvailable)
    blockers.push({
      id: 'OPERATION_CATALOG',
      label: 'Código documentado de la operación',
      description:
        'La combinación de cuenta y operación no está disponible en el catálogo documental.',
      document: 'docs/INPUT_CHECKLIST.md',
    });
  if (needsAmount(transaction))
    blockers.push({
      id: 'AMOUNT_RULES',
      label: 'Reglas financieras del monto',
      description: 'Faltan límites, denominaciones y reglas aprobadas por cuenta y escenario.',
      document: 'docs/transactions/WITHDRAWAL.md',
    });
  return blockers;
}
