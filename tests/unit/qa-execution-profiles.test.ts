import { describe, expect, it } from 'vitest';
import { parseQaExecutionProfileFile } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { qaExecutionFixture } from '../helpers/qa-execution';

describe('perfiles aprobados de ejecucion QA', () => {
  it('acepta parametros explicitos sin claves ni datos de tarjeta', () => {
    const { input, profile } = qaExecutionFixture();
    expect(parseQaExecutionProfileFile(input).profiles[0]).toEqual(profile);
    expect(profile.fixedFields.has(52)).toBe(false);
    expect(profile.fixedFields.has(55)).toBe(false);
  });
  it('acepta el AID de F55 solo cuando coincide con la aplicacion del perfil', () => {
    const { input, row } = qaExecutionFixture();
    row.emv.extraTags = { '9F06': row.applicationId };
    row.emv.field55Tags.push('9F06');
    expect(parseQaExecutionProfileFile(input).profiles[0]!.emv.extraTags.has('9F06')).toBe(true);
    row.emv.extraTags = { '9F06': 'A0000000041010' };
    expect(() => parseQaExecutionProfileFile(input)).toThrow('QA_PROFILE_INVALID');
  });
  it('permite ordenar 5F34 pero rechaza asignarle un valor fijo en el perfil', () => {
    const { input, row } = qaExecutionFixture();
    row.emv.field55Tags.push('5F34');
    expect(parseQaExecutionProfileFile(input).profiles[0]!.emv.field55Tags).toContain('5F34');
    row.emv.extraTags = { '5F34': '01' };
    expect(() => parseQaExecutionProfileFile(input)).toThrow('QA_PROFILE_INVALID');
  });
  it.each([
    (row: Record<string, unknown>) => {
      row.environment = 'PROD';
    },
    (row: Record<string, unknown>) => {
      row.pinAlgorithm = 'AUTO';
    },
    (row: Record<string, unknown>) => {
      row.pinEncoding = 'CAPTURED';
    },
    (row: Record<string, unknown>) => {
      row.reservedSequences = [1, 1];
    },
    (row: Record<string, unknown>) => {
      row.reservedSequences = [1000000];
    },
    (row: Record<string, unknown>) => {
      row.accountingDate = '2026-02-30';
    },
    (row: Record<string, unknown>) => {
      row.pin = 'DO NOT ACCEPT';
    },
    (row: Record<string, unknown>) => {
      row.cardBin = '0'.repeat(16);
    },
    (row: Record<string, unknown>) => {
      row.applicationId = 'ZZ';
    },
    (row: Record<string, unknown>) => {
      (row.fixedFields as Record<string, unknown>)['52'] = '00';
    },
    (row: Record<string, unknown>) => {
      (row.emv as Record<string, unknown>).field55Tags = ['9F26'];
    },
    (row: Record<string, unknown>) => {
      (row.emv as Record<string, unknown>).transactionType = '00';
    },
  ])('rechaza configuracion contradictoria o datos privados (%#)', (change) => {
    const { input, row } = qaExecutionFixture();
    change(row);
    expect(() => parseQaExecutionProfileFile(input)).toThrow();
  });
  it('rechaza instancias duplicadas', () => {
    const { input, row } = qaExecutionFixture();
    input.profiles.push(structuredClone(row));
    expect(() => parseQaExecutionProfileFile(input)).toThrow('QA_PROFILE_INVALID');
  });
  it('rechaza reservas STAN compartidas entre cajeros distintos', () => {
    const { input, row } = qaExecutionFixture();
    const other = structuredClone(row);
    other.id = '9a0d41b3-9800-48af-8b3e-f76046cf345c';
    other.atmId = '988b7f37-8ac7-4bb7-ac79-fdd09ce53fb5';
    other.terminalId = 'ATM99999';
    input.profiles.push(other);
    expect(() => parseQaExecutionProfileFile(input)).toThrow('QA_PROFILE_INVALID');
    other.reservedSequences = [654321];
    const profiles = parseQaExecutionProfileFile(input).profiles;
    expect(profiles).toHaveLength(2);
    // The link key may be shared; the remaining STAN reservations may not.
    expect(profiles.map((profile) => profile.keyReference)).toEqual([
      row.keyReference,
      row.keyReference,
    ]);
  });
});
