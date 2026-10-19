import { describe, expect, it } from 'vitest';
import { analyseQaOnlineAtm } from '../../packages/domain/src/emv-terminal-analysis';
import { parseQaEmvTerminalParameters } from '../../apps/desktop/src/main/adapters/emv-terminal-parameters';

const source = {
  environment: 'QA',
  terminalCapabilities: '\\60\\40\\20',
  terminalType: '\\14',
  additionalTerminalCapabilities: '\\EF\\80\\B0\\50\\10',
  tacDenial: null,
  tacOnline: '\\FF\\FF\\FF\\FF\\FF',
  tacDefault: '\\FF\\FF\\FF\\FF\\FF',
};
const issuer = { denial: null, online: null, default: null };
const run = (tvr: string, overrides = {}) =>
  analyseQaOnlineAtm({
    parameters: parseQaEmvTerminalParameters(source),
    tvr,
    issuerActionCodes: issuer,
    phase: 'BEFORE_FIRST_AC',
    ...overrides,
  });

describe('parametros EMV QA y analisis del terminal online-only', () => {
  it('normaliza octetos del Registro sin inventar capacidades', () => {
    expect(parseQaEmvTerminalParameters(source)).toMatchObject({
      terminalCapabilities: '604020',
      terminalType: '14',
      additionalTerminalCapabilities: 'EF80B05010',
      terminalActionCodes: { denial: null, online: 'FFFFFFFFFF', default: 'FFFFFFFFFF' },
    });
  });
  it('solicita ARQC para terminal online-only incluso con TVR sin bits activos', () => {
    expect(run('0000000000')).toEqual({
      requestedCryptogram: 'ARQC',
      reason: 'ONLINE_ONLY_TERMINAL',
    });
  });
  it('usa TAC-Denial cero cuando esta confirmado ausente, manteniendo IAC-Denial', () => {
    expect(run('8000000000').requestedCryptogram).toBe('ARQC');
    expect(run('8000000000', { issuerActionCodes: { ...issuer, denial: '8000000000' } })).toEqual({
      requestedCryptogram: 'AAC',
      reason: 'DENIAL_ACTION_CODE',
    });
  });
  it('respeta rechazo del terminal antes de decidir ir online', () => {
    const parameters = parseQaEmvTerminalParameters({ ...source, tacDenial: '0000800000' });
    expect(run('0000800000', { parameters }).requestedCryptogram).toBe('AAC');
    expect(run('0000000000', { parameters }).requestedCryptogram).toBe('ARQC');
  });
  it.each([0, 1, 2, 3, 4])('compara bits de rechazo en el byte %i', (index) => {
    const denial = Array.from({ length: 5 }, (_, byte) => (byte === index ? '01' : '00')).join('');
    const parameters = parseQaEmvTerminalParameters({ ...source, tacDenial: denial });
    expect(run(denial, { parameters }).requestedCryptogram).toBe('AAC');
  });
  it('solicita AAC al fallar online, sin tratarlo como aprobacion offline', () => {
    expect(run('0000000000', { phase: 'AFTER_ONLINE_UNAVAILABLE' })).toEqual({
      requestedCryptogram: 'AAC',
      reason: 'ONLINE_UNAVAILABLE',
    });
  });
  it.each([
    'terminalCapabilities',
    'terminalType',
    'additionalTerminalCapabilities',
    'tacDenial',
    'tacOnline',
    'tacDefault',
  ])('rechaza parametro ausente %s, distinto de ausencia confirmada de TAC', (field) => {
    const row = { ...source, [field]: undefined };
    expect(() => parseQaEmvTerminalParameters(row)).toThrow('EMV_TERMINAL_PARAMETER_INVALID');
  });
  it.each(['', '6040', '60402000', '\\60\\40\\GG'])(
    'rechaza capacidades malformadas %s',
    (value) => {
      expect(() =>
        parseQaEmvTerminalParameters({ ...source, terminalCapabilities: value }),
      ).toThrow('EMV_TERMINAL_PARAMETER_INVALID');
    },
  );
  it('bloquea PROD, parametros adicionales y tipos de terminal fuera del alcance', () => {
    expect(() => parseQaEmvTerminalParameters({ ...source, environment: 'PROD' })).toThrow();
    expect(() => parseQaEmvTerminalParameters({ ...source, secret: 'not-accepted' })).toThrow();
    expect(() => parseQaEmvTerminalParameters({ ...source, terminalType: '22' })).toThrow(
      'EMV_TERMINAL_PROFILE_UNSUPPORTED',
    );
  });
  it('rechaza TVR ausente o malformado en vez de rellenarlo con cero', () => {
    expect(() => run(undefined as unknown as string)).toThrow('EMV_TVR_INVALID');
    expect(() => run('0000')).toThrow('EMV_TVR_INVALID');
    expect(() => run('XXXXXXXXXX')).toThrow('EMV_TVR_INVALID');
  });
  it('no trata un IAC no leido como un IAC ausente', () => {
    expect(() =>
      run('0000000000', { issuerActionCodes: { ...issuer, denial: undefined } }),
    ).toThrow('EMV_ACTION_CODE_INVALID');
  });
  it('no modifica configuracion o TVR recibidos', () => {
    const parameters = parseQaEmvTerminalParameters(source);
    const before = JSON.stringify(parameters);
    run('0000000000', { parameters });
    expect(JSON.stringify(parameters)).toBe(before);
  });
});
