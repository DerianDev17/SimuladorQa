import { isUuid, isUtcTimestamp } from '../../../../packages/domain/src/catalogs';
import {
  parseBalanceExecutionRequest,
  parseBalanceDiagnostics,
  withdrawalBlocksNewExecution,
} from '../../../../packages/domain/src/balance-inquiry';
import type {
  BalanceExecution,
  BalanceExecutionRequest,
  BalanceReadiness,
} from '../../../../packages/domain/src/balance-inquiry';
import { failure } from '../../../../packages/shared/src/contracts';
import type { Result } from '../../../../packages/shared/src/contracts';
import type {
  BalanceContextLease,
  BalanceContextProvider,
  BalanceJournal,
  BalanceTarget,
  BalanceTransport,
} from './balance-ports';
import type { RuntimeIdentity } from './ports';
import { NewVisaBalance } from './adapters/new-visa-balance';
import { NewVisaWithdrawal } from './adapters/new-visa-withdrawal';
import {
  parseWithdrawalExecutionRequest,
  parseWithdrawalDetails,
  missingWithdrawalContext,
} from '../../../../packages/domain/src/withdrawal';
import { balanceContextErrorLabels } from './balance-context-errors';
import { parseWithdrawalReversal } from '../../../../packages/domain/src/withdrawal-reversal';

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
function release(lease: BalanceContextLease): void {
  lease.header.fill(0);
  lease.extension.fill(0);
  for (const field of lease.privateFields.values()) field.fill(0);
  try {
    lease.release();
  } catch {
    /* No provider errors or security values leave Main. */
  }
}
export class BalanceInquiryService {
  private running:
    { id: string; fingerprint: string; result: Promise<Result<BalanceExecution>> } | undefined;
  constructor(
    private readonly journal: BalanceJournal,
    private readonly transport: BalanceTransport,
    private readonly identity: RuntimeIdentity,
    private readonly context?: BalanceContextProvider,
    private readonly contextDeadlineMs = 5000,
    private readonly operation: 'BALANCE' | 'WITHDRAWAL' = 'BALANCE',
  ) {}

  isBusy(): boolean {
    return this.running !== undefined;
  }

  async inspect(target: BalanceTarget): Promise<BalanceReadiness> {
    if (!this.context)
      return structuredClone(
        this.operation === 'WITHDRAWAL' ? missingWithdrawalContext : missingBalanceContext,
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const readiness = await Promise.race([
        this.context.inspect(structuredClone(target)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(Error('CONTEXT_TIMEOUT')),
            Math.min(this.contextDeadlineMs, 5000),
          );
        }),
      ]);
      if (
        typeof readiness.ready !== 'boolean' ||
        !Array.isArray(readiness.blockers) ||
        readiness.blockers.length > 20 ||
        (readiness.ready && readiness.blockers.length > 0) ||
        (!readiness.ready && !readiness.blockers.length) ||
        (readiness.sequencesRemaining !== undefined &&
          (!Number.isSafeInteger(readiness.sequencesRemaining) ||
            readiness.sequencesRemaining < 0 ||
            readiness.sequencesRemaining > 999999)) ||
        readiness.blockers.some(
          (item) =>
            !/^[A-Z][A-Z0-9_-]{0,63}$/.test(item.id) ||
            typeof item.label !== 'string' ||
            item.label.length > 200 ||
            /\d{12}/.test(item.label) ||
            Array.from(item.label as string).some(
              (letter) => letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127,
            ),
        )
      )
        throw Error('CONTEXT_STATUS_INVALID');
      return structuredClone(readiness);
    } catch {
      return {
        ready: false,
        blockers: [
          {
            id: 'BALANCE-CONTEXT-UNAVAILABLE',
            label: 'El proveedor QA no está disponible o no respondió a tiempo',
          },
        ],
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // A failed Result is a rejection before transport. Once exchange starts,
  // return a BalanceExecution (including uncertain/storage-error outcomes).
  // Renderer relies on that distinction to release an unsent request only.
  execute(
    request: BalanceExecutionRequest,
    target: BalanceTarget,
    deadlines: { connect: number; response: number },
    revalidate: () => Promise<boolean>,
  ): Promise<Result<BalanceExecution>> {
    if (
      !(this.operation === 'WITHDRAWAL'
        ? parseWithdrawalExecutionRequest(request)
        : parseBalanceExecutionRequest(request)) ||
      JSON.stringify(request.draft) !== JSON.stringify(target.draft) ||
      request.cardReadId !== target.cardReadId ||
      request.configurationRevision !== target.configurationRevision ||
      ![deadlines.connect, deadlines.response].every(
        (number) => Number.isInteger(number) && number >= 1 && number <= 30000,
      )
    )
      return Promise.resolve(failure('VALIDATION_ERROR', 'El contexto de ejecución no es válido.'));
    const fingerprint = JSON.stringify(request);
    if (request.reversalDelaySeconds !== undefined && !this.transport.supportsReversal)
      return Promise.resolve(
        failure(
          'SERVICE_UNAVAILABLE',
          'El transporte no admite retiro con reverso. No se envió el retiro.',
        ),
      );
    if (this.running) {
      if (this.running.id !== request.requestId || this.running.fingerprint !== fingerprint)
        return Promise.resolve(failure('CONFLICT', 'Ya hay una transacción en curso.'));
      return this.running.result.then((result) => structuredClone(result));
    }
    const result = this.perform(
      structuredClone(request),
      structuredClone(target),
      { ...deadlines },
      revalidate,
    );
    this.running = { id: request.requestId, fingerprint, result };
    void result
      .finally(() => {
        this.running = undefined;
      })
      .catch(() => undefined);
    return result.then((value) => structuredClone(value));
  }

  async find(requestId: string): Promise<Result<BalanceExecution | null>> {
    try {
      return {
        ok: true,
        value: (await this.journal.read()).find((item) => item.requestId === requestId) ?? null,
      };
    } catch {
      return failure('STORAGE_UNAVAILABLE', 'No se pudo leer el historial de transacciones.');
    }
  }

  async history(): Promise<Result<readonly BalanceExecution[]>> {
    try {
      return { ok: true, value: (await this.journal.read()).slice(-50).reverse() };
    } catch {
      return failure('STORAGE_UNAVAILABLE', 'No se pudo leer el historial de transacciones.');
    }
  }
  private async perform(
    request: BalanceExecutionRequest,
    target: BalanceTarget,
    deadlines: { connect: number; response: number },
    revalidate: () => Promise<boolean>,
  ): Promise<Result<BalanceExecution>> {
    let records: BalanceExecution[];
    try {
      records = await this.journal.read();
    } catch {
      return failure(
        'STORAGE_UNAVAILABLE',
        'El historial no está disponible. No se ha enviado la transacción.',
      );
    }
    const previous = records.find((item) => item.requestId === request.requestId);
    if (previous) {
      if (
        previous.atmId !== request.draft.atmId ||
        previous.atmRevision !== request.draft.atmRevision ||
        previous.configurationRevision !== request.configurationRevision ||
        previous.cardReadId !== request.cardReadId ||
        previous.scenario !== request.draft.scenario ||
        previous.reversal?.delaySeconds !== request.reversalDelaySeconds ||
        (this.operation === 'WITHDRAWAL'
          ? previous.withdrawal?.amount !== request.draft.amount ||
            previous.withdrawal?.transaction !== request.draft.transaction
          : previous.withdrawal !== undefined)
      )
        return failure('CONFLICT', 'La referencia de ejecución ya pertenece a otra transacción.');
      return { ok: true, value: previous };
    }
    if (this.operation === 'WITHDRAWAL' && records.some(withdrawalBlocksNewExecution))
      return failure(
        'CONFLICT',
        'Hay un retiro cuyo resultado no está confirmado. Recupera su referencia antes de enviar otro.',
      );
    const record: BalanceExecution = {
      requestId: request.requestId,
      runId: this.identity.uuid(),
      transactionId: this.identity.uuid(),
      environment: 'QA',
      atmId: request.draft.atmId!,
      atmRevision: request.draft.atmRevision!,
      configurationRevision: request.configurationRevision,
      cardReadId: request.cardReadId,
      scenario: request.draft.scenario,
      startedAt: this.identity.now(),
      finishedAt: null,
      outcome: 'PENDING',
      frameGenerated: false,
      transmissionAttempted: false,
      bytesQueued: 0,
      elapsedMs: 0,
      correlation: null,
      responseCode: null,
      balances: [],
      blockers: [],
      ...(request.reversalDelaySeconds !== undefined
        ? {
            reversal: {
              transactionId: this.identity.uuid(),
              delaySeconds: request.reversalDelaySeconds,
              outcome: 'WAITING_WITHDRAWAL' as const,
              dueAt: null,
              finishedAt: null,
              responseCode: null,
              transmissionAttempted: false,
              bytesQueued: 0,
            },
          }
        : {}),
      ...(this.operation === 'WITHDRAWAL'
        ? {
            withdrawal: parseWithdrawalDetails({
              transaction: request.draft.transaction,
              account: request.draft.account,
              currency: '840',
              amount: request.draft.amount,
            })!,
          }
        : {}),
    };
    const readiness = await this.inspect(target);
    if (!readiness.ready) {
      return {
        ok: true,
        value: {
          ...record,
          outcome: 'BLOCKED',
          finishedAt: this.identity.now(),
          blockers: readiness.blockers,
          ...(record.reversal
            ? {
                reversal: {
                  ...record.reversal,
                  outcome: 'NOT_SENT' as const,
                  finishedAt: this.identity.now(),
                },
              }
            : {}),
        },
      };
    }
    if (records.length >= 200)
      return failure(
        'STORAGE_UNAVAILABLE',
        'El historial alcanzó su límite. Se conserva para impedir envíos duplicados.',
      );
    let lease: BalanceContextLease | undefined;
    let wire: Buffer | undefined;
    let transportStarted = false;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const validateLease = async (): Promise<void> => {
      if (!lease?.validate) return;
      try {
        await Promise.race([
          lease.validate(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              abort.abort();
              reject(Error('CONTEXT_TIMEOUT'));
            }, this.contextDeadlineMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      const acquire = this.context!.acquire(structuredClone(target), abort.signal).then((value) => {
        if (abort.signal.aborted) {
          release(value);
          throw Error('CONTEXT_TIMEOUT');
        }
        return value;
      });
      lease = await Promise.race([
        acquire,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abort.abort();
            reject(Error('CONTEXT_TIMEOUT'));
          }, this.contextDeadlineMs);
        }),
      ]);
      clearTimeout(timer);
      if (
        lease.environment !== 'QA' ||
        lease.securitySource !== 'GENERATED_TEST_SESSION' ||
        !isUuid(lease.profileId) ||
        lease.cardReadId !== target.cardReadId ||
        lease.account !== 'SAVINGS' ||
        (this.operation === 'WITHDRAWAL'
          ? lease.amount !== request.draft.amount
          : lease.amount !== undefined) ||
        lease.terminalId !== target.terminalId ||
        lease.endpoint.host !== target.endpoint.host ||
        lease.endpoint.port !== target.endpoint.port ||
        !isUtcTimestamp(lease.validUntil) ||
        Date.parse(lease.validUntil) <= Date.parse(this.identity.now())
      )
        throw Error('CONTEXT_INVALID');
      if (lease.diagnostics !== undefined) {
        const diagnostics = parseBalanceDiagnostics(lease.diagnostics);
        if (!diagnostics) throw Error('CONTEXT_INVALID');
        record.diagnostics = diagnostics;
      }
      const built =
        this.operation === 'WITHDRAWAL'
          ? new NewVisaWithdrawal().build({ ...lease, amount: lease.amount! })
          : new NewVisaBalance().build(lease);
      wire = built.wire;
      record.frameGenerated = true;
      record.correlation = {
        stan: built.metadata.stan,
        rrn: built.metadata.rrn,
        terminalId: built.metadata.terminalId,
      };
      await validateLease();
      if (!(await revalidate()) || Date.parse(lease.validUntil) <= Date.parse(this.identity.now()))
        throw Error('CONTEXT_CHANGED');
      records = [...records, structuredClone(record)];
      // Persist before the financial side effect. A PENDING record after restart
      // remains unresolved and is returned, never replayed automatically.
      try {
        await this.journal.write(records);
      } catch {
        return failure(
          'STORAGE_UNAVAILABLE',
          'No se pudo registrar la ejecución. No se ha enviado la transacción.',
        );
      }
      if (!(await revalidate()) || Date.parse(lease.validUntil) <= Date.parse(this.identity.now()))
        throw Error('CONTEXT_CHANGED');
      await validateLease();
      if (Date.parse(lease.validUntil) <= Date.parse(this.identity.now()))
        throw Error('CONTEXT_CHANGED');
      transportStarted = true;
      const result = await this.transport.exchange({
        environment: 'QA',
        endpoint: { ...target.endpoint },
        wire,
        expected: built.metadata,
        connectDeadlineMs: deadlines.connect,
        responseDeadlineMs: deadlines.response,
        ...(record.reversal
          ? {
              reversal: {
                delaySeconds: record.reversal.delaySeconds,
                persist: async (progress, original) => {
                  const reversal = parseWithdrawalReversal({ ...record.reversal, ...progress });
                  if (
                    !reversal ||
                    original.outcome !== 'APPROVED' ||
                    original.responseCode !== '00'
                  )
                    throw Error('REVERSAL_PROGRESS_INVALID');
                  record.outcome = original.outcome;
                  record.responseCode = original.responseCode;
                  record.transmissionAttempted = original.transmissionAttempted;
                  record.bytesQueued = original.bytesQueued;
                  record.elapsedMs = original.elapsedMs;
                  record.balances = structuredClone(original.balances);
                  record.reversal = reversal;
                  await this.journal.write([
                    ...records.filter((item) => item.requestId !== record.requestId),
                    structuredClone(record),
                  ]);
                },
              },
            }
          : {}),
      });
      if (
        ![
          'APPROVED',
          'NOT_APPROVED',
          'REQUIRES_REVIEW',
          'INVALID_RESPONSE',
          'CONNECT_TIMEOUT',
          'RESPONSE_TIMEOUT',
          'PEER_CLOSED',
          'TRANSPORT_ERROR',
        ].includes(result.outcome) ||
        typeof result.transmissionAttempted !== 'boolean' ||
        ![result.bytesQueued, result.elapsedMs].every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        ) ||
        !(
          result.responseCode === null ||
          (typeof result.responseCode === 'string' && /^\d{2}$/.test(result.responseCode))
        ) ||
        !Array.isArray(result.balances) ||
        result.balances.length > 6 ||
        result.balances.some(
          (value) =>
            value.accountCode !== '10' ||
            value.currency !== '840' ||
            !['01', '02', '91'].includes(value.type) ||
            typeof value.amount !== 'string' ||
            !/^-?(0|[1-9]\d{0,9})\.\d{2}$/.test(value.amount),
        )
      )
        throw Error('TRANSPORT_RESULT_INVALID');
      if (
        this.operation === 'WITHDRAWAL' &&
        ((result.outcome === 'APPROVED' && result.responseCode !== '00') ||
          (result.outcome === 'NOT_APPROVED' &&
            (result.responseCode !== '91' ||
              !result.transmissionAttempted ||
              result.bytesQueued <= 0)) ||
          (result.outcome !== 'APPROVED' && result.balances.length > 0))
      )
        throw Error('TRANSPORT_RESULT_INVALID');
      record.outcome = result.outcome;
      record.transmissionAttempted = result.transmissionAttempted;
      record.bytesQueued = result.bytesQueued;
      record.elapsedMs = result.elapsedMs;
      record.responseCode = result.responseCode;
      record.balances = result.balances.map(({ accountCode, type, currency, amount }) => ({
        accountCode,
        type,
        currency,
        amount,
      }));
      if (record.reversal) {
        const reversal =
          result.reversal && parseWithdrawalReversal({ ...record.reversal, ...result.reversal });
        if (!reversal) throw Error('REVERSAL_RESULT_INVALID');
        record.reversal = reversal;
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (!(record.reversal && record.outcome === 'APPROVED'))
        record.outcome = transportStarted ? 'TRANSPORT_ERROR' : 'CONTEXT_ERROR';
      record.transmissionAttempted = transportStarted;
      record.blockers = transportStarted
        ? [
            {
              id: 'BALANCE-TRANSPORT',
              label:
                'No se conoce la entrega financiera. Conserva la referencia y no repitas el envío',
            },
          ]
        : [
            {
              id: Object.hasOwn(balanceContextErrorLabels, code)
                ? code.replaceAll('_', '-')
                : 'BALANCE-CONTEXT-UNAVAILABLE',
              label: Object.hasOwn(balanceContextErrorLabels, code)
                ? balanceContextErrorLabels[code]!
                : 'No se pudo validar la tarjeta, secuencia o seguridad QA. No se envió la transacción',
            },
          ];
    } finally {
      clearTimeout(timer);
      abort.abort();
      wire?.fill(0);
      if (lease) release(lease);
    }
    record.finishedAt = this.identity.now();
    if (record.reversal && record.reversal.finishedAt === null) {
      record.reversal = {
        ...record.reversal,
        outcome: record.reversal.transmissionAttempted ? 'UNCONFIRMED' : 'NOT_SENT',
        finishedAt: record.finishedAt,
      };
    }
    try {
      await this.journal.write([
        ...records.filter((item) => item.requestId !== record.requestId),
        record,
      ]);
    } catch {
      // Do not discard a received response or suggest repeating a financial write.
      return {
        ok: true,
        value: {
          ...record,
          outcome: 'STORAGE_ERROR',
          blockers: [
            {
              id: 'BALANCE-JOURNAL',
              label:
                'No se pudo guardar el resultado; conserva esta referencia y no repitas el envío',
            },
          ],
        },
      };
    }
    return { ok: true, value: record };
  }
}
