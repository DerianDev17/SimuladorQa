export const environments = ['QA', 'PREPROD'] as const;
export type Environment = (typeof environments)[number];

export function isEnvironment(value: unknown): value is Environment {
  return value === 'QA' || value === 'PREPROD';
}

export const scenarios = [
  { id: 'LOCAL', label: 'ATM Local', description: 'ATM y tarjeta de la misma entidad.' },
  { id: 'RTC', label: 'ATM RTC', description: 'Entidades distintas dentro de Coonecta.' },
  { id: 'BANRED', label: 'BANRED', description: 'Tarjeta procesada por BANRED.' },
  { id: 'EXTERNAL', label: 'Externa', description: 'Red o entidad externa configurada.' },
] as const;
export type Scenario = (typeof scenarios)[number]['id'];

export const transactions = [
  { id: 'BALANCE', label: 'Consulta de saldo', document: 'docs/transactions/BALANCE_INQUIRY.md' },
  {
    id: 'WITHDRAWAL_APPROVED',
    label: 'Retiro aprobado',
    document: 'docs/transactions/WITHDRAWAL.md',
  },
  {
    id: 'WITHDRAWAL_DECLINED',
    label: 'Retiro rechazado',
    document: 'docs/transactions/WITHDRAWAL_DECLINED.md',
  },
  { id: 'REVERSAL', label: 'Reverso', document: 'docs/transactions/REVERSAL.md' },
  {
    id: 'TIMEOUT_REVERSAL',
    label: 'Reverso por timeout',
    document: 'docs/transactions/TIMEOUT_REVERSAL.md',
  },
] as const;
export type TransactionType = (typeof transactions)[number]['id'];

export interface PreparationRequest {
  transaction: TransactionType;
  scenario: Scenario;
}

export interface DataBlocker {
  id: string;
  label: string;
  description: string;
  document: string;
}

// Son dependencias pendientes, nunca reglas ISO o respuestas simuladas.
export const dataBlockers: readonly DataBlocker[] = [
  {
    id: 'ISO_SPEC',
    label: 'Diccionario y especificación ISO',
    description: 'ContextoISO.xml y especificación ATM aprobada.',
    document: 'docs/INPUT_CHECKLIST.md',
  },
  {
    id: 'GOLDEN_SAMPLES',
    label: 'Tramas y evidencia de QA',
    description: 'Request, response y PCAP validados para el flujo seleccionado.',
    document: 'docs/INPUT_CHECKLIST.md',
  },
  {
    id: 'ENVIRONMENT',
    label: 'Conexión del ambiente',
    description: 'Endpoint autorizado, framing y timeout oficial por escenario.',
    document: 'docs/operations/ENVIRONMENTS.md',
  },
  {
    id: 'PROFILES',
    label: 'Perfiles ATM y tarjeta',
    description: 'Al menos un ATM y una tarjeta de prueba completos y validados.',
    document: 'docs/INPUT_CHECKLIST.md',
  },
];

export interface Preparation {
  environment: Environment;
  transaction: TransactionType;
  scenario: Scenario;
  status: 'BLOCKED';
  blockers: readonly DataBlocker[];
  specification: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseEnvironmentRequest(value: unknown): Environment | undefined {
  return isRecord(value) && Object.keys(value).length === 1 && isEnvironment(value.environment)
    ? value.environment
    : undefined;
}

export function parsePreparationRequest(value: unknown): PreparationRequest | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 2) return undefined;
  const transaction = transactions.find((item) => item.id === value.transaction);
  const scenario = scenarios.find((item) => item.id === value.scenario);
  return transaction && scenario
    ? { transaction: transaction.id, scenario: scenario.id }
    : undefined;
}

export function prepareTransaction(
  environment: Environment,
  request: PreparationRequest,
): Preparation {
  const transaction = transactions.find((item) => item.id === request.transaction);
  if (
    !isEnvironment(environment) ||
    !transaction ||
    !scenarios.some((item) => item.id === request.scenario)
  ) {
    throw new Error('VALIDATION_ERROR');
  }
  return {
    environment,
    ...request,
    status: 'BLOCKED',
    blockers: dataBlockers,
    specification: transaction.document,
  };
}

// No admite Track 2 ni valores parciales ambiguos. Nunca devuelve la entrada en un error.
export function maskPan(value: string): string {
  if (!/^\d{12,19}$/.test(value)) return '[PAN no disponible]';
  return `${value.slice(0, 6)}${'*'.repeat(value.length - 10)}${value.slice(-4)}`;
}
