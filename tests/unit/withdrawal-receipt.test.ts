import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  approvedWithdrawalExecution,
  withdrawalFixture,
  withdrawalResponse,
} from '../helpers/withdrawal';
import {
  createWithdrawalReceipt,
  withdrawalReceiptRows,
} from '../../packages/domain/src/withdrawal-receipt';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import { WithdrawalReceiptService } from '../../apps/desktop/src/main/withdrawal-receipt-service';
import type { ReceiptPrinter } from '../../apps/desktop/src/main/withdrawal-receipt-service';
import { withdrawalReceiptHtml } from '../../apps/desktop/src/main/adapters/withdrawal-receipt-html';
import { BalanceExecutionView } from '../../apps/desktop/src/renderer/BalanceExecutionView';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { NewVisaWithdrawal } from '../../apps/desktop/src/main/adapters/new-visa-withdrawal';
import { parseBalanceJournal } from '../../apps/desktop/src/main/infrastructure/balance-journal';

function fixture(deadline = 1000) {
  const execution = approvedWithdrawalExecution();
  const lookup = vi.fn(async () => ({
    ok: true as const,
    value: execution as BalanceExecution | null,
  }));
  const print = vi.fn<ReceiptPrinter['print']>(async () => 'SUBMITTED');
  return {
    execution,
    lookup,
    print,
    service: new WithdrawalReceiptService(lookup, { print }, deadline),
    request: { environment: 'QA', requestId: execution.requestId },
  };
}

describe('saldos del retiro y comprobante local', () => {
  it('conserva importes exactos y tipos sin calcular saldo restante ni débito', () => {
    const execution = approvedWithdrawalExecution();
    const receipt = createWithdrawalReceipt(execution)!;
    expect(receipt.balances).toEqual(execution.balances);
    expect(receipt).not.toHaveProperty('cardReadId');
    const rows = withdrawalReceiptRows(receipt);
    expect(rows).toContainEqual(['Monto autorizado', 'USD 20.00']);
    expect(rows).toContainEqual(['Débito total', 'No confirmado']);
    expect(rows).toContainEqual(['Saldo restante', 'Sin identificar']);
    const markup = renderToStaticMarkup(
      createElement(BalanceExecutionView, { execution, onReceipt: vi.fn() }),
    );
    expect(markup).toContain('USD 123.45');
    expect(markup).toContain('USD 234.56');
    expect(markup).toContain('Ver comprobante');
    expect(markup).not.toContain('103.45');
    expect(parseBalanceJournal({ version: 1, executions: [execution] })).toEqual([execution]);
  });
  it.each([
    'NOT_APPROVED',
    'REQUIRES_REVIEW',
    'RESPONSE_TIMEOUT',
    'STORAGE_ERROR',
    'BLOCKED',
    'PENDING',
  ] as const)(
    'no genera comprobante aprobado para %s ni acepta sus saldos como confirmados',
    (outcome) => {
      const execution = { ...approvedWithdrawalExecution(), outcome };
      expect(createWithdrawalReceipt(execution)).toBeNull();
      expect(parseBalanceJournal({ version: 1, executions: [execution] })).toBeUndefined();
      const markup = renderToStaticMarkup(
        createElement(BalanceExecutionView, { execution, onReceipt: vi.fn() }),
      );
      expect(markup).not.toContain('Ver comprobante');
      expect(markup).not.toContain('USD 123.45');
    },
  );
  it('mantiene compatibilidad con retiros históricos sin saldos', () => {
    const execution = { ...approvedWithdrawalExecution(), balances: [] };
    expect(parseBalanceJournal({ version: 1, executions: [execution] })).toEqual([execution]);
    const markup = renderToStaticMarkup(createElement(BalanceExecutionView, { execution }));
    expect(markup).toContain('El host no devolvió saldos');
    expect(markup).not.toContain('USD 0.00');
  });
  it('escapa el HTML y no publica datos ajenos a la proyección del comprobante', () => {
    const receipt = createWithdrawalReceipt({
      ...approvedWithdrawalExecution(),
      diagnostics: {
        profileId: 'secret-profile',
        accountingDate: '2026-10-19',
        terminalApplicationVersion: '008C',
        cardApplicationVersion: '00A0',
        tvr: '0000000000',
        cvmResult: '000000',
      },
    })!;
    const html = withdrawalReceiptHtml({ ...receipt, terminalId: '<img src=x onerror=alert(1)>' });
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('secret-profile');
    expect(html).toContain("default-src 'none'");
  });
  it('lee F54 de retiro y admite su ausencia sin inventar un cero', () => {
    const { lease } = withdrawalFixture();
    const { metadata } = new NewVisaWithdrawal().build(lease);
    const codec = new CapturedVisaBalance('WITHDRAWAL');
    expect(codec.response(withdrawalResponse(metadata)).balances).toEqual(
      approvedWithdrawalExecution().balances,
    );
    expect(
      codec.response(withdrawalResponse(metadata, '00', (fields) => fields.delete(54))).balances,
    ).toEqual([]);
    expect(codec.response(withdrawalResponse(metadata, '91')).balances).toEqual([]);
  });
  it('rechaza un F54 mal formado y saldos duplicados', () => {
    const { lease } = withdrawalFixture();
    const { metadata } = new NewVisaWithdrawal().build(lease);
    const codec = new CapturedVisaBalance('WITHDRAWAL');
    expect(() =>
      codec.response(
        withdrawalResponse(metadata, '00', (fields) => {
          fields.get(54)![1] = 0xff;
        }),
      ),
    ).toThrow('BALANCE_VALUES_ENCODING_INVALID');
    expect(() =>
      codec.response(
        withdrawalResponse(metadata, '00', (fields) => {
          const bytes = fields.get(54)!;
          bytes.copy(bytes, 21, 1, 21);
        }),
      ),
    ).toThrow('BALANCE_VALUES_AMBIGUOUS');
  });
});

describe('servicio de impresión con referencia al diario', () => {
  it('obtiene el resultado guardado y permite reimprimir sin ejecutar el retiro', async () => {
    const f = fixture();
    expect(await f.service.print(f.request)).toEqual({ ok: true, value: 'SUBMITTED' });
    expect(await f.service.print(f.request)).toEqual({ ok: true, value: 'SUBMITTED' });
    expect(f.print).toHaveBeenCalledTimes(2);
    expect(f.print.mock.calls[0]![0]).toEqual(createWithdrawalReceipt(f.execution));
    expect(f.service.isBusy()).toBe(false);
  });
  it.each([
    { environment: 'PROD' },
    { requestId: 'bad-id' },
    { html: '<b>fake</b>' },
    { amount: '100.00' },
  ])('rechaza entrada inválida o contenido del Renderer %j', async (patch) => {
    const f = fixture();
    expect(await f.service.print({ ...f.request, ...patch })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(f.lookup).not.toHaveBeenCalled();
    expect(f.print).not.toHaveBeenCalled();
  });
  it('no imprime referencias inexistentes, distintas o resultados incompletos', async () => {
    const f = fixture();
    f.lookup.mockResolvedValueOnce({ ok: true, value: null });
    expect(await f.service.print(f.request)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    f.lookup.mockResolvedValueOnce({ ok: true, value: approvedWithdrawalExecution() });
    expect(await f.service.print(f.request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    f.lookup.mockResolvedValueOnce({ ok: true, value: { ...f.execution, outcome: 'PENDING' } });
    expect(await f.service.print(f.request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(f.print).not.toHaveBeenCalled();
  });
  it('informa cancelación y fallo de impresora sin modificar el retiro', async () => {
    const f = fixture();
    const cancelled = new WithdrawalReceiptService(f.lookup, { print: async () => 'CANCELLED' });
    expect(await cancelled.print(f.request)).toEqual({ ok: true, value: 'CANCELLED' });
    f.print.mockRejectedValueOnce(Error('PRIVATE_DRIVER_DETAIL'));
    const result = await f.service.print(f.request);
    expect(result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_DRIVER_DETAIL');
    expect(f.execution.outcome).toBe('APPROVED');
  });
  it('bloquea solapamiento, cancela al vencer el plazo y permite otro intento', async () => {
    const f = fixture(15);
    let signal: AbortSignal | undefined;
    const print = vi.fn((_receipt, inputSignal: AbortSignal) => {
      signal = inputSignal;
      return new Promise<'SUBMITTED'>(() => undefined);
    });
    const service = new WithdrawalReceiptService(f.lookup, { print }, 15);
    const pending = service.print(f.request);
    expect(await service.print(f.request)).toMatchObject({ ok: false, error: { code: 'IN_USE' } });
    expect(await pending).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(signal?.aborted).toBe(true);
    expect(service.isBusy()).toBe(false);
  });
  it('no imprime después de una recuperación tardía del diario', async () => {
    const f = fixture();
    let finish!: (result: Awaited<ReturnType<typeof f.lookup>>) => void;
    const service = new WithdrawalReceiptService(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      { print: f.print },
      10,
    );
    expect(await service.print(f.request)).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    finish({ ok: true, value: f.execution });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.print).not.toHaveBeenCalled();
  });
});
