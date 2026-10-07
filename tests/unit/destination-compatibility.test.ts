import { describe, expect, it } from 'vitest';
import { MediatorSchemaInspector } from '../../apps/desktop/src/main/adapters/mediator-schema-inspector';
import { isUtcTimestamp, isUuid } from '../../packages/domain/src/catalogs';

const inspector = new MediatorSchemaInspector();
const context = {
  environment: 'PREPROD' as const,
  terminalId: 'TERM-TEST',
  operationCode: '301000',
};

describe('compatibilidad con el esquema observado de Mediator', () => {
  it('compara longitudes ASCII con la evidencia de PREPROD sin habilitar registros ni envío', () => {
    const result = inspector.assess(context)!;
    expect(result.checks.map((check) => check.status)).toEqual(['MATCH', 'MATCH', 'NOT_CHECKED']);
    expect(result.checks[2]?.description).toContain('UUID local no sustituye EntityId');
    expect(result.source.environment).toBe('PREPROD');
    expect(isUuid(result.source.inspectionId)).toBe(true);
    expect(isUtcTimestamp(result.source.inspectedAt)).toBe(true);
    expect(result).not.toHaveProperty('connection');
    expect(Object.isFrozen(result.source)).toBe(true);
  });
  it('no aplica el esquema PREPROD a QA', () => {
    expect(inspector.assess({ ...context, environment: 'QA' })).toBeNull();
  });
  it.each([
    ['TERMINAL_ID', { terminalId: 'A'.repeat(10) }, 'MATCH'],
    ['TERMINAL_ID', { terminalId: 'A'.repeat(11) }, 'MISMATCH'],
    ['TERMINAL_ID', { terminalId: null }, 'NOT_CHECKED'],
    ['TERMINAL_ID', { terminalId: 'Terminal-é' }, 'NOT_CHECKED'],
    ['TERMINAL_ID', { terminalId: 'Term\n' }, 'NOT_CHECKED'],
    ['OPERATION_CODE', { operationCode: '3010000' }, 'MISMATCH'],
    ['OPERATION_CODE', { operationCode: null }, 'NOT_CHECKED'],
  ] as const)('evalúa %s sin truncar ni asumir codificación: %#', (id, change, expected) => {
    const input = { ...context, ...change };
    const copy = { ...input };
    expect(inspector.assess(input)?.checks.find((check) => check.id === id)?.status).toBe(expected);
    expect(input).toEqual(copy);
  });
  it('no incluye valores de formularios en mensajes de error', () => {
    const terminalId = 'Private-terminal-value';
    const result = inspector.assess({ ...context, terminalId });
    expect(JSON.stringify(result)).not.toContain(terminalId);
  });
});
