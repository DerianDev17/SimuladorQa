import { describe, expect, it } from 'vitest';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { capturedBalanceRequest } from '../helpers/captured-visa-balance';
import { balanceResponse, fixtureFields } from '../helpers/balance-inquiry';
import { testEbcdic, testIso } from '../helpers/withdrawal-reversal';
import {
  parseIsoMessage,
  parseTransactionMessages,
  protectedIsoValue,
} from '../../packages/domain/src/iso-message';
import { parseBalanceJournal } from '../../apps/desktop/src/main/infrastructure/balance-journal';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransactionMessageView } from '../../apps/desktop/src/renderer/TransactionMessageView';

describe('mensajería ISO pública', () => {
  const codec = new CapturedVisaBalance();
  it('incluye cada campo presente y solo valores públicos, sin conservar buffers', () => {
    const body = capturedBalanceRequest();
    const metadata = codec.inspect(body);
    const message = codec.message(body);
    expect(message.fields.map((field) => field.number)).toEqual(metadata.fields);
    expect(message.fields.find((field) => field.number === 2)?.value).toBe('411111XXXXXX0000');
    for (const number of [14, 35, 48, 52, 53, 55, 60, 62])
      expect(message.fields.find((field) => field.number === number)?.value).toBe(
        protectedIsoValue,
      );
    expect(message.fields.find((field) => field.number === 3)?.value).toBe('301000');
    expect(message.fields.find((field) => field.number === 4)?.value).toBe('0'.repeat(12));
    expect(message.fields.find((field) => field.number === 41)?.value).toBe('ATM20521');
    body.fill(0);
    expect(parseIsoMessage(message)).toEqual(message);
    expect(JSON.stringify(message)).not.toContain('411111' + '11110000');
  });
  it.each(['00', '96'])('muestra los campos reales del host RC %s', (code) => {
    const metadata = codec.inspect(capturedBalanceRequest());
    const message = codec.message(
      balanceResponse(metadata, code, (fields) => {
        fields.set(44, Buffer.of(2, 0xf1, 0xf2));
      }),
    );
    expect(message.mti).toBe('0210');
    expect(message.fields.find((field) => field.number === 39)?.value).toBe(code);
    expect(message.fields.find((field) => field.number === 44)?.value).toBe('12');
    expect(parseIsoMessage(message)).toEqual(message);
  });
  it('muestra comercio y tags públicos EMV, sin publicar datos de tarjeta ni criptogramas', () => {
    const fields = fixtureFields(capturedBalanceRequest());
    fields.set(42, Buffer.concat([testEbcdic('QA001'), Buffer.alloc(10, 0x40)]));
    fields.set(
      43,
      Buffer.concat([
        testEbcdic('ATM'),
        Buffer.of(0x40),
        testEbcdic('CENTRO'),
        Buffer.alloc(30, 0x40),
      ]),
    );
    const tlv = Buffer.from(
      '950580000400009F3303E0F8C89F2608DEADBEEFDEADBEEF9F1007010203040506075A08' +
        '411111' +
        '1111110000',
      'hex',
    );
    fields.set(55, Buffer.concat([Buffer.of(tlv.length + 3, 1, 0, tlv.length), tlv]));
    const message = codec.message(testIso(0x0200, fields));
    expect(message.fields.find((f) => f.number === 42)?.value.trim()).toBe('QA001');
    expect(message.fields.find((f) => f.number === 43)?.value.trim()).toBe('ATM CENTRO');
    expect(message.fields.find((f) => f.number === 55)?.tags).toEqual([
      { tag: '95', value: '8000040000' },
      { tag: '9F33', value: 'E0F8C8' },
      { tag: '9F26', value: protectedIsoValue },
      { tag: '9F10', value: protectedIsoValue },
      { tag: '5A', value: protectedIsoValue },
    ]);
    expect(parseIsoMessage(message)).toEqual(message);
    expect(JSON.stringify(message)).not.toMatch(/DEADBEEF|411111\d{10}/);
    expect(JSON.stringify(message)).not.toContain('01020304' + '050607');
  });
  it('redacta números de tarjeta en textos del host y tolera EMV inválido sin afectar el mensaje', () => {
    const metadata = codec.inspect(capturedBalanceRequest());
    const body = balanceResponse(metadata, '96', (fields) => {
      const hostText = Buffer.concat([
        testEbcdic('4111'),
        Buffer.of(0x40),
        testEbcdic('1111'),
        Buffer.of(0x40),
        testEbcdic('1111'),
        Buffer.of(0x40),
        testEbcdic('0000'),
      ]);
      fields.set(44, Buffer.concat([Buffer.of(hostText.length), hostText]));
      fields.set(55, Buffer.of(5, 1, 0, 2, 0x9f, 0x26));
    });
    const message = codec.message(body);
    expect(message.fields.find((f) => f.number === 44)?.value).toBe('******0000');
    expect(message.fields.find((f) => f.number === 55)?.tags).toBeUndefined();
    expect(message.mti).toBe('0210');
    expect(parseIsoMessage(message)).toEqual(message);
  });
  it.each(
    [
      [{ tag: '9F26', value: 'DEADBEEFDEADBEEF' }],
      [{ tag: '95', value: '00' }],
      [{ tag: 'ZZ', value: protectedIsoValue }],
      [{ tag: '95', value: '8000040000', raw: 'secret' }],
      [
        { tag: '95', value: '8000040000' },
        { tag: '95', value: '8000040000' },
      ],
    ].map((tags) => ({ tags })),
  )('rechaza tags EMV inseguros en persistencia: %j', ({ tags }) => {
    expect(
      parseIsoMessage({ mti: '0200', fields: [{ number: 55, value: protectedIsoValue, tags }] }),
    ).toBeUndefined();
  });
  it.each([
    { number: 2, value: '411111' + '11110000' },
    { number: 35, value: '123456' },
    { number: 52, value: 'A'.repeat(16) },
    { number: 55, value: '1234' },
    { number: 99, value: protectedIsoValue },
    { number: 41, value: '<script>' },
    { number: 3, value: '301000', raw: 'secret' },
  ])('rechaza contenido no permitido en diario: campo $number', (field) => {
    const messages = { request: { mti: '0200', fields: [field] } };
    expect(parseTransactionMessages(messages)).toBeUndefined();
    expect(
      parseBalanceJournal({
        version: 1,
        executions: [{ ...approvedWithdrawalExecution(), messages }],
      }),
    ).toBeUndefined();
  });
  it('rechaza duplicados, direcciones invertidas, tramas truncadas y atributos extra', () => {
    const request = codec.message(capturedBalanceRequest());
    expect(
      parseIsoMessage({ ...request, fields: [request.fields[0], request.fields[0]] }),
    ).toBeUndefined();
    expect(parseTransactionMessages({ request: { ...request, mti: '0210' } })).toBeUndefined();
    expect(parseTransactionMessages({ request, response: request })).toBeUndefined();
    expect(parseTransactionMessages({ request, raw: 'secret' })).toBeUndefined();
    expect(() => codec.message(capturedBalanceRequest().subarray(0, 40))).toThrow(
      'BALANCE_SOURCE_UNSUPPORTED',
    );
  });
  it('mantiene compatibilidad con diarios históricos sin mensajes', () => {
    const record = approvedWithdrawalExecution();
    expect(parseBalanceJournal({ version: 1, executions: [record] })).toEqual([record]);
  });
  it('explica ausencia de trama o mensajería histórica sin fabricar campos', () => {
    const record = approvedWithdrawalExecution();
    const historical = renderToStaticMarkup(
      createElement(TransactionMessageView, { execution: record }),
    );
    expect(historical).toContain('no tiene mensajería guardada');
    expect(historical).not.toContain('<table');
    const blocked = renderToStaticMarkup(
      createElement(TransactionMessageView, {
        execution: {
          ...record,
          outcome: 'BLOCKED',
          frameGenerated: false,
          transmissionAttempted: false,
          bytesQueued: 0,
        },
      }),
    );
    expect(blocked).toContain('No se generó una trama');
  });
  it('tras timeout conserva la solicitud sin mostrar aprobación ni inventar respuesta', () => {
    const record = approvedWithdrawalExecution();
    const rendered = renderToStaticMarkup(
      createElement(TransactionMessageView, {
        execution: {
          ...record,
          outcome: 'RESPONSE_TIMEOUT',
          responseCode: null,
          messages: { request: codec.message(capturedBalanceRequest()) },
        },
      }),
    );
    expect(rendered).toContain('Solicitud del intento de envío');
    expect(rendered).toContain('411111XXXXXX0000');
    expect(rendered).not.toContain('Respuesta recibida del host');
  });
});
