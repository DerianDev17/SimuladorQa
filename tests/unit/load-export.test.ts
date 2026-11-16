import { describe, it, expect } from 'vitest';
import {
  createLoadExport,
  loadRunEvidence,
  parseLoadExportRequest,
} from '../../packages/domain/src/load-export';
import { historyRun } from '../helpers/load-history';
const now = '2026-11-03T01:00:00.000Z';

describe('evidencia pública de carga', () => {
  it('exporta retiro exacto y correlación; omite mensajes libres y propiedades no permitidas', () => {
    const run = historyRun({ message: 'PRIVATE-MESSAGE' });
    run.draft = { ...run.draft, operation: 'WITHDRAWAL', amount: '25.50' };
    Object.assign(run, { pin: 'PRIVATE-PIN', raw: 'PRIVATE-RAW' });
    Object.assign(run.draft, { key: 'PRIVATE-KEY' });
    Object.assign(run.items[0]!, { emv: 'PRIVATE-EMV' });
    Object.assign(run.items[0]!.correlation!, { secret: 'PRIVATE-CORRELATION' });
    const file = createLoadExport(run, 'JSON', now);
    const evidence = JSON.parse(file.contents);
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      exportedAt: now,
      evidence: 'LOCAL_LOAD_RUN',
      run: {
        runId: run.runId,
        plan: { operation: 'WITHDRAWAL', amount: '25.50', currency: 'USD' },
        metrics: { tps: 1, p95: 100 },
        operations: [{ correlation: { stan: '000123', rrn: '123'.padStart(12, '0') } }],
      },
    });
    expect(file.contents).not.toContain('PRIVATE-');
    expect(file.filename).toBe(`carga-${run.runId}.json`);
  });
  it('preserva incertidumbre y no inventa latencia, correlación ni timings ausentes', () => {
    const run = historyRun({ state: 'FAILED' });
    Object.assign(run.items[0]!, {
      outcome: 'RESPONSE_TIMEOUT',
      received: false,
      responseCode: null,
      correlation: null,
    });
    const evidence = loadRunEvidence(run, now);
    expect(evidence.run.metrics).toMatchObject({
      sent: 1,
      received: 0,
      approved: 0,
      unconfirmed: 1,
      timeouts: 1,
      errors: 1,
      p95: null,
    });
    expect(evidence.run.operations[0]).toMatchObject({
      outcome: 'RESPONSE_TIMEOUT',
      correlation: null,
      timings: null,
      received: false,
    });
  });
  it('no atribuye un ATM a operaciones antiguas de varios perfiles sin identidad registrada', () => {
    const run = historyRun();
    run.draft.additionalAtms = [{ atmId: historyRun().draft.atmId, atmRevision: 1 }];
    expect(loadRunEvidence(run, now).run.operations[0]!.atmId).toBeNull();
  });
  it('produce CSV UTF-8 con cabecera, resumen repetido y una fila por operación', () => {
    const run = historyRun();
    run.items.push({ ...run.items[0]! });
    const file = createLoadExport(run, 'CSV', now);
    expect(file.contents.startsWith('\uFEFF')).toBe(true);
    const rows = file.contents.trimEnd().split('\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('"amountPerOperation"');
    expect(rows[0]).toContain('"transactionId"');
    expect(rows[1]).toContain('"000123"');
    expect(rows[1]).toContain('"TRANSACTION"');
    expect(rows[1]).toContain(run.runId);
  });
  it('mantiene una fila de corrida sin operaciones y neutraliza fórmulas CSV', () => {
    const empty = createLoadExport(historyRun({ items: [] }), 'CSV', now);
    expect(empty.contents.trimEnd().split('\r\n')).toHaveLength(2);
    expect(empty.contents).toContain('"RUN"');
    const run = historyRun();
    run.items[0]!.correlation!.terminalId = '=2+2';
    expect(createLoadExport(run, 'CSV', now).contents).toContain(`"'=2+2"`);
    run.items[0]!.correlation!.terminalId = 'A"B,C';
    expect(createLoadExport(run, 'CSV', now).contents).toContain('"A""B,C"');
  });
  it('valida solicitud, fecha y formato sin aceptar rutas ni contenido desde Renderer', () => {
    const runId = historyRun().runId;
    expect(parseLoadExportRequest({ runId, format: 'CSV' })).toEqual({ runId, format: 'CSV' });
    expect(parseLoadExportRequest({ runId, format: 'HTML' })).toEqual({ runId, format: 'HTML' });
    for (const value of [
      null,
      { runId: '../private', format: 'JSON' },
      { runId, format: 'PDF' },
      { runId, format: 'JSON', path: 'private' },
      { runId, format: 'HTML', contents: '<html>forged</html>' },
    ])
      expect(parseLoadExportRequest(value)).toBeUndefined();
    expect(() => loadRunEvidence(historyRun(), 'not-utc')).toThrow('LOAD_EXPORT_INVALID');
  });
  it.each(['CSV', 'JSON', 'HTML'] as const)(
    '%s excluye mensajes y propiedades privadas de ATM adicionales, operaciones y tiempos',
    (format) => {
      const run = historyRun({ message: 'PRIVATE-MESSAGE' });
      run.draft.additionalAtms = [{ atmId: historyRun().draft.atmId, atmRevision: 2 }];
      Object.assign(run.draft.additionalAtms[0]!, { secret: 'PRIVATE-ATM' });
      Object.assign(run.items[0]!, {
        pin: 'PRIVATE-PIN',
        timings: { transportMs: 100, secret: 'PRIVATE-TIMING' },
      });
      expect(createLoadExport(run, format, now).contents).not.toContain('PRIVATE-');
    },
  );
  it('HTML conserva plan, métricas, montos exactos, correlación y todas las operaciones', () => {
    const run = historyRun();
    run.draft = { ...run.draft, operation: 'WITHDRAWAL', amount: '25.50' };
    run.items.push({ ...run.items[0]!, outcome: 'NOT_APPROVED', responseCode: '05' });
    const file = createLoadExport(run, 'HTML', now);
    expect(file.filename).toBe(`carga-${run.runId}.html`);
    for (const text of [
      run.runId,
      run.requestId,
      run.startedAt,
      now,
      'USD 25.50',
      run.items[0]!.transactionId!,
      '000123',
      '123'.padStart(12, '0'),
      'NOT_APPROVED',
      '2 operaciones',
      'no confirma débito ni conciliación',
    ])
      expect(file.contents).toContain(text);
    expect(file.contents).toContain('<dt>TPS observado</dt><dd>2.00</dd>');
    expect(file.contents).toContain('<dt>p95</dt><dd>100.00</dd>');
    expect(file.contents).toContain('Content-Security-Policy');
    expect(file.contents).toContain("default-src 'none'");
    expect(file.contents).toContain('@media print');
    expect(file.contents).not.toMatch(/<script|<iframe|<link|<img/i);
  });
  it('HTML escapa todo contenido dinámico sin permitir marcado activo', () => {
    const run = historyRun();
    run.items[0]!.correlation!.terminalId = `<img src="x" onerror='alert(1)'>&`;
    const { contents } = createLoadExport(run, 'HTML', now);
    expect(contents).toContain('&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;');
    expect(contents).not.toContain('<img');
  });
  it('HTML distingue ausencia de datos y operaciones vacías de cero y de una respuesta', () => {
    const run = historyRun({ state: 'INTERRUPTED', finishedAt: null });
    run.draft.additionalAtms = [{ atmId: historyRun().draft.atmId, atmRevision: 1 }];
    Object.assign(run.items[0]!, {
      outcome: 'RESPONSE_TIMEOUT',
      received: false,
      responseCode: null,
      correlation: null,
    });
    const { contents } = createLoadExport(run, 'HTML', now);
    expect(contents).toContain('<dt>p95</dt><dd>Sin dato</dd>');
    expect(contents).toContain('<dt>Enviadas sin respuesta</dt><dd>1</dd>');
    expect(contents).toContain('<dt>Respuestas recibidas</dt><dd>0</dd>');
    expect(contents).toContain('<dt>ATM</dt><dd>Sin dato</dd>');
    expect(contents).toContain('RESPONSE_TIMEOUT');
    const empty = createLoadExport(historyRun({ items: [] }), 'HTML', now).contents;
    expect(empty).toContain('No hay operaciones registradas');
    expect(empty).toContain('<dt>TPS observado</dt><dd>0.00</dd>');
    expect(empty).toContain('<dt>Monto por retiro</dt><dd>No aplica</dd>');
  });
});
