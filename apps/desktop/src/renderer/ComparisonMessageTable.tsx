import { useId, useState } from 'react';
import type { IsoMessage } from '../../../../packages/domain/src/iso-message';
import {
  compareIsoMessages,
  type ComparisonStatus,
  type MessageComparisonRow,
} from '../../../../packages/domain/src/iso-message-comparison';
import { compareDisplayValues, type ValueSegment } from './comparison-value-diff';
import {
  filterComparisonRows,
  formatComparisonValue,
  summarizeComparisonRows,
} from './transaction-comparison-presentation';

export interface ComparisonSlot {
  id: string;
  title: string;
  reference: IsoMessage | undefined;
  current: IsoMessage | undefined;
  referenceComplete: boolean;
  currentComplete: boolean;
}
const labels: Record<ComparisonStatus, string> = {
  equal: 'Igual',
  changed: 'Diferente',
  added: 'Añadido en B',
  removed: 'Ausente en B',
  unverifiable: 'No verificable',
};
function Value({
  value,
  segments,
  side,
}: {
  value: string | undefined;
  segments: ValueSegment[] | undefined;
  side: 'A' | 'B';
}) {
  return (
    <>
      <code className="comparison-value">
        {segments && value
          ? segments.map((segment, index) =>
              segment.changed ? (
                <mark
                  key={index}
                  className={`diff-${side}`}
                  aria-label={
                    side === 'A' ? 'Caracteres retirados de A' : 'Caracteres incorporados en B'
                  }
                >
                  {segment.text.replace(/ /g, '·').replace(/\n/g, '↵\n').replace(/\t/g, '⇥')}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )
          : formatComparisonValue(value)}
      </code>
      {value !== undefined && (
        <small className="comparison-length">{Array.from(value).length} caracteres</small>
      )}
    </>
  );
}
function Row({ row, id, focused }: { row: MessageComparisonRow; id: string; focused: boolean }) {
  const diff =
    row.status === 'changed' && row.reference !== undefined && row.current !== undefined
      ? compareDisplayValues(row.reference, row.current)
      : undefined;
  return (
    <tr
      id={id}
      tabIndex={-1}
      data-comparison={row.status}
      className={focused ? 'is-focused' : undefined}
    >
      <th scope="row">
        <strong>{row.id}</strong>
        <span>{row.label}</span>
        {row.variable && <small>Identificador variable</small>}
      </th>
      <td>
        <Value value={row.reference} segments={diff?.reference} side="A" />
      </td>
      <td>
        <Value value={row.current} segments={diff?.current} side="B" />
      </td>
      <td>
        <span className={`comparison-state state-${row.status}`}>{labels[row.status]}</span>
        {row.status === 'unverifiable' && <small>Máscara o mensaje no disponible</small>}
      </td>
    </tr>
  );
}
export function ComparisonMessageTable({ slots }: { slots: readonly ComparisonSlot[] }) {
  const id = useId();
  const [slotId, setSlotId] = useState(slots[0]!.id);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState('');
  const slot = slots.find((item) => item.id === slotId) ?? slots[0]!;
  const all = compareIsoMessages(
    { message: slot.reference, complete: slot.referenceComplete },
    { message: slot.current, complete: slot.currentComplete },
  );
  const rows = filterComparisonRows(all, query, onlyDifferences);
  const counts = summarizeComparisonRows(all);
  const differences = rows.filter(
    (row) => row.status === 'changed' || row.status === 'added' || row.status === 'removed',
  );
  const focusedIndex = differences.findIndex((row) => `${slot.id}:${row.id}` === focused);
  function navigate(direction: number) {
    const index =
      focusedIndex < 0
        ? direction > 0
          ? 0
          : differences.length - 1
        : (focusedIndex + direction + differences.length) % differences.length;
    const row = differences[index];
    if (!row) return;
    setFocused(`${slot.id}:${row.id}`);
    const element = document.getElementById(`${id}-row-${row.id}`);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  return (
    <section className="comparison-result" aria-label="Comparación campo por campo">
      <div className="comparison-message-tabs" role="tablist" aria-label="Mensaje a comparar">
        {slots.map((item, index) => (
          <button
            key={item.id}
            role="tab"
            id={`${id}-${item.id}`}
            aria-selected={slot.id === item.id}
            aria-controls={`${id}-panel`}
            tabIndex={slot.id === item.id ? 0 : -1}
            onClick={() => {
              setSlotId(item.id);
              setFocused('');
            }}
            onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                slots[
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? slots.length - 1
                      : (index + (event.key === 'ArrowLeft' ? slots.length - 1 : 1)) % slots.length
                ]!;
              setSlotId(next.id);
              setFocused('');
              document.getElementById(`${id}-${next.id}`)?.focus();
            }}
          >
            {item.title}
            <small>
              A {item.reference?.mti ?? '—'} / B {item.current?.mti ?? '—'}
            </small>
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${slot.id}`}>
        <div className="comparison-totals" aria-label={`Resumen de ${slot.title.toLowerCase()}`}>
          <span>
            <strong>{counts.changed}</strong> Diferentes
          </span>
          <span>
            <strong>{counts.added}</strong> Añadidas
          </span>
          <span>
            <strong>{counts.removed}</strong> Ausentes
          </span>
          <span>
            <strong>{counts.unverifiable}</strong> No verificables
          </span>
          <span>
            <strong>{counts.equal}</strong> Iguales
          </span>
        </div>
        <div className="comparison-tools">
          <label>
            Buscar campo o tag
            <input
              type="search"
              placeholder="F39, respuesta, 9F26…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setFocused('');
              }}
            />
          </label>
          <label className="comparison-check">
            <input
              type="checkbox"
              checked={onlyDifferences}
              onChange={(event) => {
                setOnlyDifferences(event.target.checked);
                setFocused('');
              }}
            />
            Solo diferencias y valores no verificables
          </label>
        </div>
        <div className="comparison-actions">
          <span>
            Mostrando {rows.length} de {all.length} filas · MTI, campos y tags
          </span>
          <button className="secondary" disabled={!differences.length} onClick={() => navigate(-1)}>
            Anterior diferencia
          </button>
          <button className="secondary" disabled={!differences.length} onClick={() => navigate(1)}>
            Siguiente diferencia
          </button>
          <span aria-live="polite">
            {focusedIndex < 0
              ? `${differences.length} cambios navegables`
              : `Diferencia ${focusedIndex + 1} de ${differences.length}`}
          </span>
        </div>
        {(!slot.reference || !slot.current) && (
          <p className="comparison-notice">
            Mensaje no disponible en{' '}
            {!slot.reference && !slot.current ? 'A y B' : !slot.reference ? 'A' : 'B'}. No se puede
            verificar la comparación.
          </p>
        )}
        <p className="comparison-legend">
          <span className="diff-A">− Retirado de A</span>
          <span className="diff-B">+ Incorporado en B</span> Resaltado por caracteres; · representa
          un espacio modificado.
        </p>
        {rows.length ? (
          <div
            className="comparison-grid-scroll"
            role="region"
            aria-label="Campos comparados"
            tabIndex={0}
          >
            <table
              className="comparison-grid"
              aria-label={`Diferencias de ${slot.title.toLowerCase()}`}
            >
              <thead>
                <tr>
                  <th>Campo / descripción</th>
                  <th>A · Referencia</th>
                  <th>B · A revisar</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Row
                    key={`${slot.id}:${row.id}`}
                    row={row}
                    id={`${id}-row-${row.id}`}
                    focused={focused === `${slot.id}:${row.id}`}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="comparison-empty">
            No hay filas que coincidan con los filtros. Borra la búsqueda o muestra también los
            valores iguales.
          </p>
        )}
      </div>
    </section>
  );
}
