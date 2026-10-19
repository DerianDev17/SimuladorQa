import { describe, expect, it } from 'vitest';
import { parseQaEmvTerminalParameters } from '../../apps/desktop/src/main/adapters/emv-terminal-parameters';
import { analyseQaOnlineAtm } from '../../packages/domain/src/emv-terminal-analysis';
import { readEmvIdentity } from '../../apps/desktop/src/main/adapters/emv-card-identity';
import { fakeCardSession, identityResponses, success, tlv } from '../helpers/card-identity';

describe('configuracion publica EMV -> decision previa al criptograma', () => {
  it('consume parametros del Registro y IAC de la lectura del chip sin omitir rechazos', async () => {
    const parameters = parseQaEmvTerminalParameters({
      environment: 'QA',
      terminalCapabilities: '\\60\\40\\20',
      terminalType: '\\14',
      additionalTerminalCapabilities: '\\EF\\80\\B0\\50\\10',
      tacDenial: null,
      tacOnline: '\\FF\\FF\\FF\\FF\\FF',
      tacDefault: '\\FF\\FF\\FF\\FF\\FF',
    });
    const responses = identityResponses();
    responses[5] = success(tlv('70', tlv('9F0E', Buffer.from('0000800000', 'hex'))));
    const card = fakeCardSession(responses);
    const reading = await readEmvIdentity(card.session, {
      readId: '2b86d181-9efb-4808-b8a8-876a843876b8',
      readAt: '2026-10-13T12:00:00.000Z',
      readerName: 'CI Reader',
    });
    if (!reading.issuerActionCodes) throw Error('IAC_NOT_READ');
    const input = {
      parameters,
      tvr: '0000800000',
      issuerActionCodes: reading.issuerActionCodes,
      phase: 'BEFORE_FIRST_AC' as const,
    };
    expect(analyseQaOnlineAtm(input)).toEqual({
      requestedCryptogram: 'AAC',
      reason: 'DENIAL_ACTION_CODE',
    });
    expect(
      analyseQaOnlineAtm({
        ...input,
        issuerActionCodes: { ...input.issuerActionCodes, denial: null },
      }),
    ).toEqual({ requestedCryptogram: 'ARQC', reason: 'ONLINE_ONLY_TERMINAL' });
    expect(
      analyseQaOnlineAtm({ ...input, phase: 'AFTER_ONLINE_UNAVAILABLE' }).requestedCryptogram,
    ).toBe('AAC');
    expect(card.commands.some((command) => command[1] === 0xae)).toBe(false);
  });
});
