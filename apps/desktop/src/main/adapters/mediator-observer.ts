import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type {
  ObservationBatch,
  ObservationRequest,
} from '../../../../../packages/domain/src/observations';
import { parseObservationRequest } from '../../../../../packages/domain/src/observations';
import { failure } from '../../../../../packages/shared/src/contracts';
import type { Result } from '../../../../../packages/shared/src/contracts';
import type { TransactionObserver } from '../observation-port';

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
        [row.requestStructure, row.responseStructure].some((value) => !isProtectedStructure(value))
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

function isProtectedStructure(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 16384) return false;
  if (
    [
      '[Mensaje ausente o protegido por longitud]',
      '[Mensaje protegido: limite excedido]',
      '[Mensaje protegido: XML no validado]',
    ].includes(value)
  )
    return true;
  const names = 'Campo|ExtremeMsg|ExtremeMsgReply|Header|Data|FxTable|HField|DField';
  const fields =
    'TraceId|EntityId|EntityIdDest|ChannelId|RealDate|TerminalID|TerminalId|TerminalSeq|MsgType|TrnCode|ValueTrn|BussDate|RetCode|Reverse|AccountId1|AccountId2|AccountNum1|AccountNum2|SubTrnCode|CodigoProceso|Mensaje|FechaContable|SaldoTotal|SaldoDisponible|ValorDebitadoParcial|MappedRespCode|MsgErr';
  return new RegExp(`^(?:<\\/?(?:${names})(?: name="(?:${fields})")?>|\\[PROTEGIDO\\])+$`).test(
    value,
  );
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
      const finish = (result: Result<ObservationBatch>) => {
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
            ? decodeResponse(output, request.limit)
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
