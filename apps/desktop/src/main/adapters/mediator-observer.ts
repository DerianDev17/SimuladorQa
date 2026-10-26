import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type {
  ObservationBatch,
  ObservationRequest,
} from '../../../../../packages/domain/src/observations';
import { parseObservationRequest } from '../../../../../packages/domain/src/observations';
import { parseMediatorLiveRequest } from '../../../../../packages/domain/src/mediator-live';
import type {
  MediatorLiveBatch,
  MediatorLiveRequest,
  MediatorLiveRow,
} from '../../../../../packages/domain/src/mediator-live';
import { failure } from '../../../../../packages/shared/src/contracts';
import type { Result } from '../../../../../packages/shared/src/contracts';
import type { TransactionObserver } from '../observation-port';
import {
  isProtectedCmsStructure,
  reviewFinancialStructure,
  supportsFinancialReview,
} from './cms-financial-contract';

export function decodeResponse(output: string, limit: number): Result<ObservationBatch> {
  try {
    const response = JSON.parse(output) as {
      ok?: unknown;
      code?: unknown;
      value?: ObservationBatch;
    };
    if (response.ok === false) {
      if (response.code === 'TLS_ERROR')
        return failure(
          'TLS_ERROR',
          'SQL Server respondió, pero su certificado TLS no pudo validarse. Configura un certificado confiable para Mediator.',
        );
      if (response.code === 'TIMEOUT')
        return failure('TIMEOUT', 'Mediator no respondió dentro del tiempo permitido.');
      if (response.code === 'FORBIDDEN')
        return failure(
          'FORBIDDEN',
          'Configura una cuenta de solo lectura para consultar Mediator. La cuenta actual tiene permisos de escritura o administración.',
        );
      return failure(
        'SERVICE_UNAVAILABLE',
        'Revisa la configuración local de Mediator, las credenciales y la disponibilidad del servidor.',
      );
    }
    const batch = response.value;
    if (
      response.ok !== true ||
      !batch ||
      !Array.isArray(batch.rows) ||
      batch.rows.length > limit ||
      typeof batch.hasMore !== 'boolean'
    )
      throw new Error();
    for (const row of batch.rows) {
      if (
        !row ||
        !/^-?\d{1,19}$/.test(row.traceId) ||
        typeof row.traceId !== 'string' ||
        (row.terminalSequence !== null &&
          (typeof row.terminalSequence !== 'string' ||
            !/^-?\d{1,19}$/.test(row.terminalSequence))) ||
        (row.terminalId !== null &&
          (typeof row.terminalId !== 'string' || !/^[A-Za-z0-9_-]{1,10}$/.test(row.terminalId))) ||
        (row.transactionCode !== null &&
          (typeof row.transactionCode !== 'string' || !/^\d{6}$/.test(row.transactionCode))) ||
        (row.occurredAt !== null &&
          (typeof row.occurredAt !== 'string' ||
            !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}$/.test(row.occurredAt))) ||
        [row.messageType, row.returnCode].some(
          (value) => value !== null && !Number.isInteger(value),
        ) ||
        [row.requestStructure, row.responseStructure].some(
          (value) => !isProtectedCmsStructure(value),
        )
      )
        throw new Error();
    }
    // Proyección explícita: no propagar propiedades inesperadas del proceso.
    return {
      ok: true,
      value: {
        hasMore: batch.hasMore,
        rows: batch.rows.map((row) => ({
          traceId: row.traceId,
          terminalId: row.terminalId,
          terminalSequence: row.terminalSequence,
          occurredAt: row.occurredAt,
          transactionCode: row.transactionCode,
          messageType: row.messageType,
          returnCode: row.returnCode,
          requestStructure: row.requestStructure,
          responseStructure: row.responseStructure,
          ...(supportsFinancialReview(row.transactionCode)
            ? {
                requestContract: reviewFinancialStructure(row.requestStructure, 'request'),
                responseContract: reviewFinancialStructure(row.responseStructure, 'response'),
              }
            : {}),
        })),
      },
    };
  } catch {
    return failure(
      'SERVICE_UNAVAILABLE',
      'Mediator devolvió datos que no cumplen el contrato de observación.',
    );
  }
}

export function decodeLiveResponse(output: string, limit: number): Result<MediatorLiveBatch> {
  try {
    const response = JSON.parse(output) as { ok?: unknown; code?: unknown; value?: unknown };
    if (response.ok === false) {
      return decodeResponse(output, limit) as Result<MediatorLiveBatch>;
    }
    const value = response.value as { rows?: unknown; hasMore?: unknown } | undefined;
    if (
      response.ok !== true ||
      !value ||
      !Array.isArray(value.rows) ||
      value.rows.length > limit ||
      typeof value.hasMore !== 'boolean'
    )
      throw new Error();
    const rows = value.rows.map((input: unknown): MediatorLiveRow => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
      const row = input as Record<string, unknown>;
      const nullable = (key: string, pattern: RegExp): string | null => {
        const item = row[key];
        if (item === null) return null;
        if (typeof item !== 'string' || !pattern.test(item)) throw new Error();
        return item;
      };
      const traceId = nullable('traceId', /^-?\d{1,19}$/);
      if (traceId === null) throw new Error();
      const messageType = row.messageType;
      const returnCode = row.returnCode;
      if (
        [messageType, returnCode].some(
          (item) => item !== null && (typeof item !== 'number' || !Number.isSafeInteger(item)),
        )
      )
        throw new Error();
      return {
        traceId,
        occurredAt: nullable('occurredAt', /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}$/),
        terminalId: nullable('terminalId', /^[A-Za-z0-9_-]{1,10}$/),
        terminalSequence: nullable('terminalSequence', /^-?\d{1,19}$/),
        transactionCode: nullable('transactionCode', /^\d{6}$/),
        messageType: messageType as number | null,
        returnCode: returnCode as number | null,
        cardMasked: nullable('cardMasked', /^\*{4} \d{4}$/),
        valueText: nullable('valueText', /^-?\d{1,20}(?:\.\d{1,20})?(?:[eE][+-]?\d{1,3})?$/),
      };
    });
    return { ok: true, value: { rows, hasMore: value.hasMore } };
  } catch {
    return failure('SERVICE_UNAVAILABLE', 'Mediator devolvió un historial en vivo inválido.');
  }
}

export class MediatorObserver implements TransactionObserver {
  private stop: (() => void) | undefined;
  private closed = false;
  constructor(
    private readonly script: string,
    private readonly configuration: string,
    private readonly timeoutMs = 15_000,
  ) {}

  search(request: ObservationRequest): Promise<Result<ObservationBatch>> {
    if (!parseObservationRequest(request) || request.environment !== 'PREPROD')
      return Promise.resolve(failure('VALIDATION_ERROR', 'Consulta de Mediator inválida.'));
    return this.execute(request, (output) => decodeResponse(output, request.limit));
  }

  live(request: MediatorLiveRequest): Promise<Result<MediatorLiveBatch>> {
    if (!parseMediatorLiveRequest(request))
      return Promise.resolve(failure('VALIDATION_ERROR', 'Consulta en vivo de Mediator inválida.'));
    return this.execute(request, (output) => decodeLiveResponse(output, request.limit));
  }

  private execute<T>(
    request: ObservationRequest | MediatorLiveRequest,
    decode: (output: string) => Result<T>,
  ): Promise<Result<T>> {
    if (this.closed || process.platform !== 'win32')
      return Promise.resolve(
        failure(
          'SERVICE_UNAVAILABLE',
          'El observador requiere Windows y una configuración local válida.',
        ),
      );
    if (this.stop) return Promise.resolve(failure('CONFLICT', 'Ya hay una consulta en curso.'));
    return new Promise((resolve) => {
      const child = spawn(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        ),
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          this.script,
          '-ConfigurationPath',
          this.configuration,
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
      );
      let output = '';
      let finished = false;
      const finish = (result: Result<T>) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.stop = undefined;
        child.kill();
        resolve(result);
      };
      const timer = setTimeout(
        () => finish(failure('TIMEOUT', 'La consulta de Mediator excedió el tiempo permitido.')),
        this.timeoutMs,
      );
      this.stop = () => finish(failure('SERVICE_UNAVAILABLE', 'El observador se cerró.'));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        output += chunk;
        if (Buffer.byteLength(output, 'utf8') > 4_000_000)
          finish(failure('SERVICE_UNAVAILABLE', 'La respuesta excedió el límite permitido.'));
      });
      child.on('error', () =>
        finish(failure('SERVICE_UNAVAILABLE', 'No se pudo iniciar el observador de Mediator.')),
      );
      child.on('close', (code) =>
        finish(
          code === 0
            ? decode(output)
            : failure('SERVICE_UNAVAILABLE', 'No se pudo completar la consulta de Mediator.'),
        ),
      );
      child.stdin.on('error', () =>
        finish(failure('SERVICE_UNAVAILABLE', 'No se pudo enviar la consulta al observador.')),
      );
      child.stdin.end(JSON.stringify(request));
    });
  }

  close(): void {
    this.closed = true;
    this.stop?.();
  }
}
