import { isRecord } from '../../../../packages/domain/src/index';
import { isUuid } from '../../../../packages/domain/src/catalogs';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import {
  createWithdrawalReceipt,
  type ReceiptPrintStatus,
  type WithdrawalReceipt,
  type WithdrawalReceiptRequest,
} from '../../../../packages/domain/src/withdrawal-receipt';
import { failure, type Result } from '../../../../packages/shared/src/contracts';

export interface ReceiptPrinter {
  print(receipt: WithdrawalReceipt, signal: AbortSignal): Promise<ReceiptPrintStatus>;
}

export class WithdrawalReceiptService {
  private busy = false;
  constructor(
    private readonly lookup: (
      request: WithdrawalReceiptRequest,
    ) => Promise<Result<BalanceExecution | null>>,
    private readonly printer: ReceiptPrinter,
    private readonly deadlineMs = 120000,
  ) {}

  isBusy(): boolean {
    return this.busy;
  }

  async print(payload: unknown): Promise<Result<ReceiptPrintStatus>> {
    if (
      !isRecord(payload) ||
      Object.keys(payload).length !== 2 ||
      payload.environment !== 'QA' ||
      !isUuid(payload.requestId)
    )
      return failure('VALIDATION_ERROR', 'Selecciona un retiro QA registrado para imprimir.');
    if (this.busy) return failure('IN_USE', 'Ya hay un comprobante en impresión.');
    const request: WithdrawalReceiptRequest = { environment: 'QA', requestId: payload.requestId };
    this.busy = true;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async (): Promise<Result<ReceiptPrintStatus>> => {
          const result = await this.lookup(request);
          if (abort.signal.aborted) return failure('TIMEOUT', 'La impresión agotó el plazo.');
          if (!result.ok) return result;
          if (!result.value) return failure('NOT_FOUND', 'No se encontró el retiro registrado.');
          const receipt = createWithdrawalReceipt(result.value);
          if (!receipt || receipt.requestId !== request.requestId)
            return failure('CONFLICT', 'El comprobante requiere un retiro autorizado y guardado.');
          return { ok: true, value: await this.printer.print(receipt, abort.signal) };
        })(),
        new Promise<Result<never>>((resolve) => {
          timer = setTimeout(() => {
            resolve(
              failure('TIMEOUT', 'La impresión agotó el plazo. Revisa la cola de impresión.'),
            );
            abort.abort();
          }, this.deadlineMs);
        }),
      ]);
    } catch {
      return failure(
        'SERVICE_UNAVAILABLE',
        'No se pudo imprimir. Revisa la impresora e inténtalo de nuevo.',
      );
    } finally {
      clearTimeout(timer);
      abort.abort();
      this.busy = false;
    }
  }
}
