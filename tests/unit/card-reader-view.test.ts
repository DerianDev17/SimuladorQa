import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardReaderPanel } from '../../apps/desktop/src/renderer/CardReaderView';
import { decodeReaderStatus } from '../../apps/desktop/src/main/adapters/windows-pcsc-reader';
import type {
  CardIdentityReading,
  CardReaderSnapshot,
  ReaderDevice,
} from '../../packages/domain/src/card-reader';

const present: ReaderDevice = { name: 'CI Reader', state: 'CARD_PRESENT', atr: '3B00' };
const empty: ReaderDevice = { name: 'CI Other Reader', state: 'EMPTY', atr: null };
function render(
  readers: ReaderDevice[] | undefined,
  options: {
    error?: string;
    selectedName?: string;
    compact?: boolean;
    identity?: CardIdentityReading;
  } = {},
) {
  const snapshot: CardReaderSnapshot | undefined = readers && {
    checkedAt: '2026-10-08T20:00:00.000Z',
    readers,
    identityStatus: 'NOT_READ',
    ...(options.identity ? { identity: options.identity } : {}),
  };
  return renderToStaticMarkup(
    createElement(CardReaderPanel, {
      snapshot,
      error: options.error,
      refreshing: readers === undefined && !options.error,
      selectedName: options.selectedName,
      onSelect: () => undefined,
      onRefresh: () => undefined,
      compact: options.compact ?? false,
    }),
  );
}

describe('presentación de tarjeta detectada', () => {
  it('prioriza una interfaz con tarjeta y muestra solo los datos leídos', () => {
    const markup = render([empty, present]);
    expect(markup).toContain('detected-card is-present');
    expect(markup).toContain('<code>3B 00</code>');
    expect(markup).toContain('Presencia confirmada');
    expect(markup).toContain('Pendiente de lectura');
    expect(markup).toContain('No leído');
    expect(markup).toContain('2 interfaces');
    expect(markup).not.toContain('2 tarjetas');
  });

  it('cambia de interfaz y descarta el ATR de otra tarjeta', () => {
    const markup = render([empty, present], { selectedName: empty.name });
    expect(markup).toContain('detected-card is-empty');
    expect(markup).not.toContain('3B 00');
    expect(markup).toContain('Inserta o acerca una tarjeta');
  });

  it('vuelve a una interfaz disponible si se desconecta la seleccionada', () => {
    const markup = render([present], { selectedName: 'Disconnected' });
    expect(markup).toContain('detected-card is-present');
    expect(markup).toContain('CI Reader');
  });

  it('limpia tarjeta y datos después de retirarla', () => {
    expect(render([present])).toContain('<code>3B 00</code>');
    const markup = render([{ ...present, state: 'EMPTY', atr: null }]);
    expect(markup).not.toContain('<code>');
    expect(markup).not.toContain('Presencia confirmada');
    expect(markup).toContain('Sin tarjeta detectada');
  });

  it.each([
    { readers: [], text: 'No hay lectores conectados' },
    { readers: undefined, text: 'Consultando lector…' },
    { readers: [{ ...empty, state: 'UNAVAILABLE' as const }], text: 'Lector no disponible' },
    { readers: [{ ...present, atr: null }], text: 'No disponible' },
  ])('presenta estados sin datos ficticios: $text', ({ readers, text }) => {
    expect(render(readers)).toContain(text);
  });

  it.each(['El lector no respondió a tiempo.', 'No se pudo consultar PC/SC.'])(
    'permite volver a consultar tras un fallo: %s',
    (error) => {
      const markup = render(undefined, { error });
      expect(markup).toContain('role="alert"');
      expect(markup).toContain(error);
      expect(markup).toContain('Revisa la conexión');
      expect(markup).not.toContain('disabled=""');
      expect(markup).not.toContain('<code>');
    },
  );

  it('no muestra información extra descartada por el adaptador', () => {
    const snapshot = decodeReaderStatus(
      JSON.stringify({
        ok: true,
        readers: [{ ...present, pan: 'PRIVATE-PAN', holder: 'PRIVATE-HOLDER' }],
      }),
      '2026-10-08T20:00:00.000Z',
    );
    const markup = render([...snapshot.readers]);
    expect(markup).not.toContain('PRIVATE');
    expect(markup).toContain('No leído');
  });

  it('conserva los datos técnicos en el dashboard compacto', () => {
    const markup = render([present], { compact: true });
    expect(markup).toContain('card-reader-compact');
    expect(markup).toContain('<code>3B 00</code>');
    expect(markup).not.toContain('<dt>Titular</dt>');
  });
  it('muestra los datos leídos y no los atribuye a una interfaz distinta', () => {
    const identity: CardIdentityReading = {
      readId: '2b86d181-9efb-4808-b8a8-876a843876b8',
      readAt: '2026-10-08T20:00:00.000Z',
      readerName: present.name,
      status: 'READ',
      applications: [],
      applicationId: null,
      applicationLabel: 'QA CARD',
      panMasked: '*'.repeat(12) + '4444',
      cardholderName: 'QA TESTER',
      expiry: '12/29',
    };
    const markup = render([present, empty], { identity });
    expect(markup).toContain('QA TESTER');
    expect(markup).toContain('12/29');
    expect(markup).toContain(identity.panMasked);
    expect(markup).toContain('Leído del chip');
    const other = render([present, empty], { identity, selectedName: empty.name });
    expect(other).not.toContain('QA TESTER');
    expect(other).not.toContain('12/29');
  });
});
