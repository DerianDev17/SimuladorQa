import { describe, expect, it } from 'vitest';
import {
  compareIsoMessages,
  type ComparisonMessage,
} from '../../packages/domain/src/iso-message-comparison';
import { protectedIsoValue, type IsoMessage } from '../../packages/domain/src/iso-message';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransactionComparison } from '../../apps/desktop/src/renderer/TransactionComparison';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';

function source(
  fields: IsoMessage['fields'],
  complete = false,
  mti: IsoMessage['mti'] = '0200',
): ComparisonMessage {
  return { message: { mti, fields }, complete };
}
describe('comparación literal de mensajes', () => {
  it('ordena campos, detecta cambios, ausencias y añadidos sin mutar entradas', () => {
    const left = source([
      { number: 41, value: 'ATM00001' },
      { number: 4, value: '2000'.padStart(12, '0') },
      { number: 11, value: '000123' },
    ]);
    const right = source([
      { number: 4, value: '3000'.padStart(12, '0') },
      { number: 37, value: '1234'.repeat(3) },
      { number: 11, value: '000124' },
    ]);
    const before = structuredClone([left, right]);
    expect(
      compareIsoMessages(left, right).map(({ id, status, variable }) => ({ id, status, variable })),
    ).toEqual([
      { id: 'MTI', status: 'equal', variable: false },
      { id: 'F4', status: 'changed', variable: false },
      { id: 'F11', status: 'changed', variable: true },
      { id: 'F37', status: 'added', variable: true },
      { id: 'F41', status: 'removed', variable: false },
    ]);
    expect([left, right]).toEqual(before);
  });
  it.each([protectedIsoValue, '411111XXXXXX0000', '******0000'])(
    'no declara iguales valores protegidos: %s',
    (value) => {
      const masked = source([{ number: 2, value }]);
      expect(compareIsoMessages(masked, masked)[1]?.status).toBe('unverifiable');
      expect(
        compareIsoMessages(source([{ number: 2, value: 'synthetic' }], true), masked)[1]?.status,
      ).toBe('unverifiable');
    },
  );
  it('compara valores completos y conserva espacios sin normalizar', () => {
    const left = source(
      [
        { number: 43, value: 'TEST ' },
        { number: 52, value: 'HEX 0123' },
      ],
      true,
    );
    const right = source(
      [
        { number: 43, value: 'TEST' },
        { number: 52, value: 'HEX 0123' },
      ],
      true,
      '0210',
    );
    expect(compareIsoMessages(left, right).map((row) => row.status)).toEqual([
      'changed',
      'changed',
      'equal',
    ]);
  });
  it('compara tags por identificador, conservando incertidumbre de tags privados', () => {
    const left = source([
      {
        number: 55,
        value: protectedIsoValue,
        tags: [
          { tag: '95', value: '8000040000' },
          { tag: '9F26', value: protectedIsoValue },
        ],
      },
    ]);
    const right = source([
      {
        number: 55,
        value: protectedIsoValue,
        tags: [
          { tag: '9F26', value: protectedIsoValue },
          { tag: '95', value: '0000000000' },
          { tag: '9A', value: '261124' },
        ],
      },
    ]);
    expect(compareIsoMessages(left, right).map((row) => [row.id, row.status])).toEqual([
      ['MTI', 'equal'],
      ['F55', 'unverifiable'],
      ['F55/95', 'changed'],
      ['F55/9A', 'added'],
      ['F55/9F26', 'unverifiable'],
    ]);
    expect(compareIsoMessages(right, left).find((row) => row.id === 'F55/9A')?.status).toBe(
      'removed',
    );
  });
  it('no convierte un mensaje perdido por timeout en campos eliminados', () => {
    const absent = { message: undefined, complete: false };
    for (const pair of [
      [absent, source([{ number: 39, value: '00' }])],
      [source([]), absent],
      [absent, absent],
    ] as const) {
      expect(
        compareIsoMessages(pair[0], pair[1]).every((row) => row.status === 'unverifiable'),
      ).toBe(true);
    }
  });
  it.each([false, true])(
    'no inventa ausencias cuando falta el desglose de tags (completo: %s)',
    (complete) => {
      const undecoded = source([{ number: 55, value: 'opaque' }], complete);
      const decoded = source(
        [{ number: 55, value: 'opaque', tags: [{ tag: '95', value: '0000000000' }] }],
        complete,
      );
      for (const pair of [
        [undecoded, decoded],
        [decoded, undecoded],
      ] as const) {
        expect(compareIsoMessages(...pair).find((row) => row.id === 'F55/95')?.status).toBe(
          'unverifiable',
        );
      }
    },
  );
  it('distingue desglose vacío y campo ausente de desglose no disponible', () => {
    const decoded = source([
      { number: 55, value: 'opaque', tags: [{ tag: '95', value: '0000000000' }] },
    ]);
    for (const absent of [source([]), source([{ number: 55, value: '', tags: [] }])]) {
      expect(compareIsoMessages(absent, decoded).find((row) => row.id === 'F55/95')?.status).toBe(
        'added',
      );
      expect(compareIsoMessages(decoded, absent).find((row) => row.id === 'F55/95')?.status).toBe(
        'removed',
      );
    }
  });
  it('rechaza selección propia o identificadores que no están en el historial cargado', () => {
    const execution = approvedWithdrawalExecution();
    const html = renderToStaticMarkup(
      createElement(TransactionComparison, {
        execution,
        candidates: [execution],
        client: undefined,
        complete: false,
        currentSession: undefined,
      }),
    );
    expect(html).toContain('Empieza eligiendo la transacción A');
    expect(html).not.toContain(`value="${execution.requestId}"`);
    expect(html).not.toContain('Diferencias de solicitud');
  });
});
