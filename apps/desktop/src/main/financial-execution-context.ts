import { isUuid } from '../../../../packages/domain/src/catalogs';
import type { BalanceReadiness } from '../../../../packages/domain/src/balance-inquiry';
import { LOAD_RUN_MAX_CONCURRENCY } from '../../../../packages/domain/src/load-run';

export const missingBalanceContext: BalanceReadiness = {
  ready: false,
  blockers: [
    {
      id: 'CARD-TRANSACTION-SECURITY',
      label:
        'Completar la integración del cifrado PIN y el procesamiento EMV en el simulador; hay fuentes y parámetros recibidos',
    },
    {
      id: 'CB-SEQUENCE-CONTRACT',
      label:
        'Integrar la asignación de serial ATM y fechas por operación según las fuentes recibidas',
    },
    {
      id: 'ATM-IMAGE-ACTIVE-PROFILE',
      label: 'Vincular el perfil CB 205 recibido al proveedor transaccional del simulador',
    },
  ],
};
export type BalanceLoadPhase =
  'inspect' | 'context' | 'validation' | 'journal' | 'transport' | 'connectionWait';
export interface BalanceExecutionContext {
  runId: string;
  signal: AbortSignal;
  onPhase?: (phase: BalanceLoadPhase, elapsedMs: number) => void;
  // Main-only load scope. Never accepted from Renderer payloads.
  concurrency?: number;
  deadline?: number;
  withWrite?: (write: () => Promise<void>) => Promise<void>;
  onPrepared?: () => void;
  onInterrupted?: (reason: 'CANCELLED' | 'DURATION') => void;
}
export function loadExecutionScope(execution?: BalanceExecutionContext): string | undefined {
  return execution &&
    isUuid(execution.runId) &&
    Number.isInteger(execution.concurrency) &&
    execution.concurrency! >= 1 &&
    execution.concurrency! <= LOAD_RUN_MAX_CONCURRENCY
    ? `${execution.runId}:${execution.concurrency}`
    : undefined;
}
