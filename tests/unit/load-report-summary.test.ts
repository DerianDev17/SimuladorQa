import { describe, expect, it } from 'vitest';
import { createLoadExport, loadRunEvidence } from '../../packages/domain/src/load-export';
import {
  loadBusinessSummary,
  loadStageSummary,
} from '../../packages/domain/src/load-report-summary';
import { historyRun } from '../helpers/load-history';
import { loadReportExample } from '../helpers/load-report-examples';
const now = '2026-11-16T15:00:00.000Z';

describe('informes por audiencia', () => {
  it('negocio resume hechos y próximos pasos sin mezclar la tabla técnica ni certificar producción', () => {
    const run = loadReportExample(false);
    Object.assign(run, { message: 'PRIVATE-MESSAGE', secret: 'PRIVATE-KEY' });
    const report = createLoadExport(run, 'HTML', now, 'BUSINESS');
    expect(report.filename).toBe(`carga-negocio-${run.runId}.html`);
    for (const text of [
      'Informe de negocio',
      'Qué se probó',
      'Qué se observó',
      'Qué falta confirmar',
      'Próximos pasos sugeridos',
      run.runId,
      '12 envíos y 12 respuestas',
      'inferior al objetivo',
      'no constituye una aprobación para producción',
    ])
      expect(report.contents).toContain(text);
    expect(report.contents).not.toContain(run.items[0]!.transactionId);
    expect(report.contents).not.toContain('PRIVATE-');
    expect(report.contents).not.toContain('<table');
    expect(report.contents).not.toContain('<script');
  });
  it('negocio conserva incertidumbre y recomienda verificación sin reenviar', () => {
    const run = loadReportExample(true);
    run.draft = { ...run.draft, operation: 'WITHDRAWAL', amount: '25.50', concurrency: 1 };
    const summary = loadBusinessSummary(loadRunEvidence(run, now));
    expect(summary.state).toBe('Finalizada con fallo');
    expect(summary.conclusion).toContain('pendiente de verificación');
    expect(summary.nextSteps.join(' ')).toContain('ausencia de débito');
    expect(summary.findings.join(' ')).toContain('6 envíos y 5 respuestas');
  });
  it('distingue corridas vacías, rechazos, interrupciones y estrés sin inventar aceptación', () => {
    const run = historyRun({ items: [], state: 'INTERRUPTED' });
    let summary = loadBusinessSummary(loadRunEvidence(run, now));
    expect(summary.conclusion).toContain('No hay envíos');
    expect(summary.findings.join(' ')).toContain('Interrumpida');
    expect(summary.nextSteps.join(' ')).toContain('dependencias');
    const rejected = historyRun();
    rejected.items[0]!.outcome = 'NOT_APPROVED';
    summary = loadBusinessSummary(loadRunEvidence(rejected, now));
    expect(summary.conclusion).toContain('no aprobadas o errores');
    rejected.draft = { ...rejected.draft, mode: 'STRESS', rampUpSeconds: 10 };
    summary = loadBusinessSummary(loadRunEvidence(rejected, now));
    expect(summary.findings.join(' ')).toContain('pico de una rampa');
    expect(summary.findings.join(' ')).not.toContain('inferior al objetivo');
  });
  it('las dos audiencias escapan valores y conservan importes exactos', () => {
    const run = historyRun();
    run.draft = { ...run.draft, operation: 'WITHDRAWAL', amount: '25.50' };
    for (const audience of ['BUSINESS', 'TECHNICAL'] as const)
      expect(createLoadExport(run, 'HTML', now, audience).contents).toContain('USD 25.50');
    run.startedAt = '<img src=x>';
    const html = createLoadExport(run, 'HTML', now, 'BUSINESS').contents;
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img');
  });
  it('etapas usan solo mediciones presentes, conservan cero y exponen cobertura', () => {
    const run = historyRun();
    run.items.push({ ...run.items[0]! }, { ...run.items[0]! });
    const evidence = loadRunEvidence(run, now);
    evidence.run.operations[0]!.timings = { transportMs: 0 };
    evidence.run.operations[1]!.timings = { transportMs: 100 };
    const stages = loadStageSummary(evidence);
    expect(stages.find((stage) => stage.key === 'transportMs')).toMatchObject({
      samples: 2,
      sum: 100,
      avg: 50,
      min: 0,
      max: 100,
    });
    expect(stages.find((stage) => stage.key === 'cardReadMs')).toMatchObject({
      samples: 0,
      sum: null,
      avg: null,
      min: null,
      max: null,
    });
    const technical = createLoadExport(run, 'HTML', now, 'TECHNICAL').contents;
    expect(technical).toContain('Tiempos por etapa');
    expect(technical).toContain('Metodología y límites');
    expect(technical).toContain('0 / 3');
  });
});
