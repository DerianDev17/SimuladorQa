import { describe, expect, it } from 'vitest';
import {
  isEnvironment,
  maskPan,
  parseEnvironmentRequest,
  parsePreparationRequest,
  prepareTransaction,
  scenarios,
  transactions,
} from '../../packages/domain/src/index';

describe('restricciones de dominio', () => {
  it.each(['QA', 'PREPROD'])('acepta el ambiente %s', (environment) => {
    expect(isEnvironment(environment)).toBe(true);
    expect(parseEnvironmentRequest({ environment })).toBe(environment);
  });
  it.each(['PROD', 'prod', '', null, {}, 7])('rechaza un ambiente inválido: %s', (environment) => {
    expect(isEnvironment(environment)).toBe(false);
    expect(parseEnvironmentRequest({ environment })).toBeUndefined();
  });
  it('rechaza claves no documentadas y payloads ambiguos', () => {
    expect(parseEnvironmentRequest({ environment: 'QA', host: 'untrusted' })).toBeUndefined();
    expect(parseEnvironmentRequest(['QA'])).toBeUndefined();
    expect(
      parsePreparationRequest({ transaction: 'BALANCE', scenario: 'LOCAL', pan: 'sensitive' }),
    ).toBeUndefined();
    expect(parsePreparationRequest({ transaction: 'UNKNOWN', scenario: 'LOCAL' })).toBeUndefined();
    expect(
      parsePreparationRequest({ transaction: 'BALANCE', scenario: 'UNKNOWN' }),
    ).toBeUndefined();
    expect(parsePreparationRequest(null)).toBeUndefined();
  });
  it('los cinco flujos y cuatro escenarios permanecen bloqueados por evidencia', () => {
    for (const transaction of transactions) {
      for (const scenario of scenarios) {
        const request = { transaction: transaction.id, scenario: scenario.id };
        expect(parsePreparationRequest(request)).toEqual(request);
        const preparation = prepareTransaction('QA', request);
        expect(preparation.status).toBe('BLOCKED');
        expect(preparation.blockers).toHaveLength(4);
        expect(preparation.specification).toBe(transaction.document);
        expect(preparation).not.toHaveProperty('responseCode');
      }
    }
  });
});

describe('PAN enmascarado (valores sintéticos, sin tarjeta real)', () => {
  it.each([12, 16, 19])('oculta los dígitos centrales de un PAN de longitud %s', (length) => {
    const pan = '0'.repeat(length);
    expect(maskPan(pan)).toBe(`${'0'.repeat(6)}${'*'.repeat(length - 10)}${'0'.repeat(4)}`);
    expect(maskPan(pan)).not.toContain(pan);
  });
  it.each(['', '123', 'track=private;data?', '0'.repeat(20)])(
    'no devuelve entradas inválidas',
    (pan) => {
      expect(maskPan(pan)).toBe('[PAN no disponible]');
    },
  );
});
