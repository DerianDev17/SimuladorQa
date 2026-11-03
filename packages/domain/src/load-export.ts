import { isUuid, isUtcTimestamp } from './catalogs';
import { isRecord } from './index';
import type { LoadRunSnapshot } from './load-run';
import { loadRunMetrics } from './load-run';
import { loadTestAtms } from './load-test';

export type LoadExportFormat = 'CSV' | 'JSON';
export interface LoadExportRequest {
  runId: string;
  format: LoadExportFormat;
}
export type LoadExportStatus = 'SAVED' | 'CANCELLED';
export interface LoadExportDocument {
  filename: string;
  format: LoadExportFormat;
  contents: string;
}
export function parseLoadExportRequest(value: unknown): LoadExportRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !isUuid(value.runId) ||
    (value.format !== 'CSV' && value.format !== 'JSON')
  )
    return;
  return { runId: value.runId, format: value.format };
}

// Explicit projection: never serialize a complete database record or free-form message.
export function loadRunEvidence(run: LoadRunSnapshot, exportedAt: string) {
  if (!isUuid(run.runId) || !isUtcTimestamp(exportedAt)) throw Error('LOAD_EXPORT_INVALID');
  const timings = [
    'queueWaitMs',
    'rateLimitMs',
    'connectionWaitMs',
    'cardReadMs',
    'inspectMs',
    'contextMs',
    'validationMs',
    'journalMs',
    'transportMs',
    'otherMs',
    'totalMs',
  ] as const;
  return {
    schemaVersion: 1,
    evidence: 'LOCAL_LOAD_RUN',
    notice:
      'Evidencia local de ejecución; no confirma débito ni conciliación en Core. Errores incluye timeouts. TPS usa tiempo total; latencias usan respuestas recibidas.',
    exportedAt,
    run: {
      runId: run.runId,
      requestId: run.requestId,
      state: run.state,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      elapsedMs: run.elapsedMs,
      plan: {
        environment: run.draft.environment,
        operation: run.draft.operation,
        amount: run.draft.operation === 'WITHDRAWAL' ? run.draft.amount : null,
        currency: run.draft.operation === 'WITHDRAWAL' ? 'USD' : null,
        mode: run.draft.mode,
        atms: loadTestAtms(run.draft),
        targetTps: run.draft.targetTps,
        concurrency: run.draft.concurrency,
        maxTransactions: run.draft.maxTransactions,
        durationSeconds: run.draft.durationSeconds,
        rampUpSeconds: run.draft.rampUpSeconds,
      },
      metrics: loadRunMetrics(run),
      operations: run.items.map((item) => ({
        requestId: item.requestId,
        transactionId: item.transactionId,
        atmId: item.atmId ?? (loadTestAtms(run.draft).length === 1 ? run.draft.atmId : null),
        finishedAt: item.finishedAt ?? null,
        finishedElapsedMs: item.finishedElapsedMs ?? null,
        outcome: item.outcome,
        cancelled: item.cancelled ?? false,
        sent: item.sent,
        received: item.received,
        responseCode: item.responseCode,
        elapsedMs: item.elapsedMs,
        correlation: item.correlation
          ? {
              stan: item.correlation.stan,
              rrn: item.correlation.rrn,
              terminalId: item.correlation.terminalId,
            }
          : null,
        timings: item.timings
          ? Object.fromEntries(
              timings
                .filter((key) => item.timings![key] !== undefined)
                .map((key) => [key, item.timings![key]]),
            )
          : null,
      })),
    },
  };
}
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function createLoadExport(
  run: LoadRunSnapshot,
  format: LoadExportFormat,
  exportedAt: string,
): LoadExportDocument {
  const evidence = loadRunEvidence(run, exportedAt);
  const base = {
    schemaVersion: evidence.schemaVersion,
    evidence: evidence.evidence,
    notice: evidence.notice,
    exportedAt,
    runId: run.runId,
    runRequestId: run.requestId,
    state: run.state,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    runElapsedMs: run.elapsedMs,
    environment: evidence.run.plan.environment,
    operation: evidence.run.plan.operation,
    amountPerOperation: evidence.run.plan.amount,
    currency: evidence.run.plan.currency,
    mode: evidence.run.plan.mode,
    configuredAtmIds: evidence.run.plan.atms.map((atm) => atm.atmId).join(';'),
    targetTps: run.draft.targetTps,
    concurrency: run.draft.concurrency,
    maxTransactions: run.draft.maxTransactions,
    durationSeconds: run.draft.durationSeconds,
    rampUpSeconds: run.draft.rampUpSeconds,
    ...evidence.run.metrics,
  };
  const rows = (evidence.run.operations.length ? evidence.run.operations : [null]).map((item) => ({
    ...base,
    recordType: item ? 'TRANSACTION' : 'RUN',
    transactionId: item?.transactionId ?? null,
    requestId: item?.requestId ?? null,
    atmId: item?.atmId ?? null,
    terminalId: item?.correlation?.terminalId ?? null,
    stan: item?.correlation?.stan ?? null,
    rrn: item?.correlation?.rrn ?? null,
    operationFinishedAt: item?.finishedAt ?? null,
    outcome: item?.outcome ?? null,
    operationCancelled: item?.cancelled ?? null,
    operationSent: item?.sent ?? null,
    operationReceived: item?.received ?? null,
    responseCode: item?.responseCode ?? null,
    operationElapsedMs: item?.elapsedMs ?? null,
  }));
  const contents =
    format === 'JSON'
      ? JSON.stringify(evidence, null, 2) + '\n'
      : '\uFEFF' +
        [Object.keys(rows[0]!), ...rows.map((row) => Object.values(row))]
          .map((row) => row.map(csvCell).join(','))
          .join('\r\n') +
        '\r\n';
  return { filename: `carga-${run.runId}.${format.toLowerCase()}`, format, contents };
}
