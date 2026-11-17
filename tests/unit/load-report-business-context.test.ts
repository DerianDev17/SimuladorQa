import { describe, expect, it } from 'vitest';
import { createLoadExport, loadRunEvidence } from '../../packages/domain/src/load-export';
import { loadBusinessContext } from '../../packages/domain/src/load-report-business-context';
import { loadBusinessSummary } from '../../packages/domain/src/load-report-summary';
import { historyRun } from '../helpers/load-history';

const now = '2026-11-16T15:00:00.000Z';

describe('lectura de negocio de la evidencia de carga', () => {
  it('particiona todas las operaciones sin duplicar cancelaciones ni respuestas no concluyentes', () => {
    const run = historyRun();
    const item = run.items[0]!;
    run.items = [
      item,
      { ...item, outcome: 'NOT_APPROVED', responseCode: '91' },
      { ...item, outcome: 'REQUIRES_REVIEW', responseCode: '91' },
      { ...item, outcome: 'INVALID_RESPONSE' },
      { ...item, outcome: 'STORAGE_ERROR' },
      { ...item, outcome: 'RESPONSE_TIMEOUT', received: false, responseCode: null },
      { ...item, outcome: 'BLOCKED', sent: false, received: false, cancelled: true },
      { ...item, outcome: 'CONTEXT_ERROR', sent: false, received: false },
    ];
    const evidence = loadRunEvidence(run, now);
    const before = JSON.stringify(evidence);
    const { counts, actions } = loadBusinessContext(evidence);
    expect(counts).toEqual({
      notSent: 2,
      approved: 1,
      notApproved: 1,
      review: 4,
      reviewWithResponse: 3,
    });
    expect(counts.notSent + counts.approved + counts.notApproved + counts.review).toBe(
      run.items.length,
    );
    expect(counts.approved + counts.notApproved + counts.review).toBe(evidence.run.metrics.sent);
    expect(actions.map((action) => action.area)).toContain('QA de la estación');
    expect(actions.map((action) => action.action).join(' ')).toContain('negativa esperada');
    expect(JSON.stringify(evidence)).toBe(before); // In particular, do not reinterpret historical RC 91.
  });

  it.each(['REQUIRES_REVIEW', 'INVALID_RESPONSE', 'STORAGE_ERROR'] as const)(
    '%s con respuesta sigue visible para negocio y en el detalle técnico',
    (outcome) => {
      const run = historyRun();
      run.items[0]!.outcome = outcome;
      const evidence = loadRunEvidence(run, now);
      expect(evidence.run.metrics.unconfirmed).toBe(0);
      expect(loadBusinessContext(evidence).counts).toMatchObject({
        approved: 0,
        review: 1,
        reviewWithResponse: 1,
      });
      expect(loadBusinessSummary(evidence).conclusion).toContain('Hay 1 operación enviada');
      expect(loadBusinessSummary(evidence).conclusion).toContain('Con respuesta registrada: 1.');
      const business = createLoadExport(run, 'HTML', now, 'BUSINESS').contents;
      expect(business).toContain('business-conclusion needs-review');
      expect(business).not.toContain('sin envíos pendientes de respuesta');
      const technical = createLoadExport(run, 'HTML', now, 'TECHNICAL').contents;
      expect(technical).toContain('<tr class="unconfirmed">');
      expect(technical).toContain('aria-label="Respuestas por revisar"');
      expect(technical).toContain(outcome);
    },
  );

  it('no presenta una aprobación como concluyente si falta evidencia de respuesta', () => {
    const run = historyRun();
    run.items[0]!.received = false;
    run.items[0]!.responseCode = null;
    expect(loadBusinessContext(loadRunEvidence(run, now)).counts).toMatchObject({
      approved: 0,
      review: 1,
    });
  });

  it('saldo y retiro describen comprobaciones distintas y no certifican resultados contables', () => {
    const run = historyRun();
    const balance = loadBusinessContext(loadRunEvidence(run, now));
    expect(balance.amounts).toBeNull();
    expect(balance.approvalLabel).toBe('Consultas aprobadas');
    expect(balance.checks.flat().join(' ')).toContain('Exactitud del saldo informado');
    run.draft = { ...run.draft, operation: 'WITHDRAWAL', amount: '25.50' };
    const withdrawal = loadBusinessContext(loadRunEvidence(run, now));
    expect(withdrawal.approvalLabel).toBe('Autorizadas por el host');
    expect(withdrawal.checks.flat().join(' ')).toContain('No representa entrega de efectivo');
    expect(withdrawal.checks.flat().join(' ')).toContain('no ejecuta reversos automáticos');
    expect(createLoadExport(run, 'HTML', now, 'BUSINESS').contents).toContain(
      'no dinero dispensado, débito confirmado, pérdida ni devolución',
    );
  });

  it('calcula los importes solicitados de cada grupo en centavos y excluye lo no enviado', () => {
    const run = historyRun();
    run.draft = { ...run.draft, operation: 'WITHDRAWAL', amount: '0.10' };
    const item = run.items[0]!;
    run.items = [
      item,
      { ...item, outcome: 'NOT_APPROVED' },
      { ...item, outcome: 'RESPONSE_TIMEOUT', received: false },
      { ...item, outcome: 'BLOCKED', sent: false, received: false },
    ];
    expect(loadBusinessContext(loadRunEvidence(run, now)).amounts).toEqual({
      sent: '0.30',
      approved: '0.10',
      notApproved: '0.10',
      review: '0.10',
    });
    run.draft.amount = '9999999999.99';
    run.items = Array.from({ length: 100 }, () => ({ ...item }));
    expect(loadBusinessContext(loadRunEvidence(run, now)).amounts?.sent).toBe(
      `${'9'.repeat(12)}.00`,
    );
  });

  it('una corrida sin operaciones mantiene ceros y orienta a revisar preparación', () => {
    const run = historyRun({ items: [], state: 'FAILED' });
    run.draft = { ...run.draft, operation: 'WITHDRAWAL', amount: '25.50' };
    const context = loadBusinessContext(loadRunEvidence(run, now));
    expect(context.amounts).toEqual({
      sent: '0.00',
      approved: '0.00',
      notApproved: '0.00',
      review: '0.00',
    });
    expect(context.actions[0]).toMatchObject({ area: 'QA de la estación' });
    expect(loadBusinessSummary(loadRunEvidence(run, now)).conclusion).toContain('No hay envíos');
  });

  it.each([null, '0.00', '01.00', '-1.00', '1.234', 'NaN', '<img src=x>'])(
    'rechaza el monto inválido %s antes de calcular importes',
    (amount) => {
      const run = historyRun();
      run.draft = { ...run.draft, operation: 'WITHDRAWAL', amount: '25.50' };
      const evidence = loadRunEvidence(run, now);
      evidence.run.plan.amount = amount;
      expect(() => loadBusinessContext(evidence)).toThrow('LOAD_REPORT_AMOUNT_INVALID');
    },
  );
});
