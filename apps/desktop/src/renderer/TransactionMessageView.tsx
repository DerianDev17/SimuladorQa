import { useId, useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import {
  isoFieldLabels,
  protectedIsoValue,
  publicEmvTags,
} from '../../../../packages/domain/src/iso-message';
import { Icon } from './Icon';

export function TransactionMessageView({ execution }: { execution: BalanceExecution }) {
  const tabs = [
    {
      key: 'request',
      label: 'Solicitud (0200)',
      message: execution.messages?.request,
      attempted: execution.transmissionAttempted,
      response: false,
    },
    {
      key: 'response',
      label: 'Respuesta (0210)',
      message: execution.messages?.response,
      attempted: execution.transmissionAttempted,
      response: true,
    },
    ...(execution.reversal
      ? [
          {
            key: 'reversal-request',
            label: 'Reverso (0420)',
            message: execution.reversal.messages?.request,
            attempted: execution.reversal.transmissionAttempted,
            response: false,
          },
          {
            key: 'reversal-response',
            label: 'Respuesta reverso (0430)',
            message: execution.reversal.messages?.response,
            attempted: execution.reversal.transmissionAttempted,
            response: true,
          },
        ]
      : []),
  ];
  const [selected, setSelected] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  // Follow progress until the operator explicitly selects a message.
  const active =
    tabs.find((tab) => tab.key === selected) ??
    [...tabs].reverse().find((tab) => tab.message) ??
    tabs[0]!;
  const { message } = active;
  const id = useId();
  const tags = message?.fields.find((field) => field.number === 55)?.tags;
  const reversalTab = active.key.startsWith('reversal-');
  return (
    <section
      className="panel transaction-inspector live-message-inspector"
      aria-label="Mensajería de la transacción"
    >
      <div className="panel-heading">
        <h2>Mensaje ISO8583</h2>
        <span className="pill neutral">
          {message ? `${message.fields.length} campos` : 'Campos'}
        </span>
      </div>
      <div className="inspector-tabs" role="tablist" aria-label="Mensajes de la transacción">
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={`${id}-${tab.key}`}
            role="tab"
            aria-selected={active.key === tab.key}
            aria-controls={`${id}-fields`}
            tabIndex={active.key === tab.key ? 0 : -1}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? tabs[0]!
                  : event.key === 'End'
                    ? tabs.at(-1)!
                    : tabs[
                        (index + (event.key === 'ArrowLeft' ? tabs.length - 1 : 1)) % tabs.length
                      ]!;
              setSelected(next.key);
              document.getElementById(`${id}-${next.key}`)?.focus();
            }}
            onClick={() => setSelected(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        key={active.key}
        id={`${id}-fields`}
        role="tabpanel"
        aria-labelledby={`${id}-${active.key}`}
        tabIndex={0}
      >
        <p className="message-state">
          {active.response
            ? message
              ? 'Respuesta recibida del host'
              : 'Sin respuesta disponible'
            : active.attempted
              ? 'Solicitud del intento de envío'
              : message
                ? 'Solicitud preparada · sin envío'
                : 'Solicitud no generada'}
        </p>
        {message ? (
          <>
            <div className={`message-fields-scroll${expanded ? ' is-expanded' : ''}`}>
              <table className="inspector-table" aria-label="Campos del mensaje">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Descripción</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>MTI</td>
                    <td>Tipo de mensaje</td>
                    <td className="iso-field-value">{message.mti}</td>
                  </tr>
                  {message.fields.map((field) => (
                    <tr key={field.number}>
                      <td>{field.number}</td>
                      <td>{isoFieldLabels[field.number]}</td>
                      <td
                        className="iso-field-value"
                        title={
                          field.value === protectedIsoValue
                            ? 'Contenido sensible o privado protegido'
                            : undefined
                        }
                      >
                        {field.tags
                          ? `${field.tags.length} tags · desglose debajo`
                          : field.value.trim() || 'Vacío'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tags && (
                <section className="iso-emv-details" aria-label="Desglose EMV">
                  <h3>Datos EMV · F55</h3>
                  <table className="inspector-table" aria-label="Tags EMV del mensaje">
                    <thead>
                      <tr>
                        <th>Tag</th>
                        <th>Descripción</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tags.map((tag) => (
                        <tr key={tag.tag}>
                          <td>{tag.tag}</td>
                          <td>{publicEmvTags[tag.tag]?.label ?? 'Dato protegido'}</td>
                          <td className="iso-field-value">{tag.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </div>
            <button
              className="text-button message-expand"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Compactar tabla' : 'Ver todos los campos sin desplazamiento interno'}
            </button>
          </>
        ) : (
          <p className="message-empty" role="status">
            {reversalTab
              ? execution.reversal?.outcome === 'WAITING_WITHDRAWAL'
                ? 'El reverso requiere primero la aprobación completa del retiro.'
                : execution.reversal?.outcome === 'WAITING'
                  ? 'El reverso se generará al terminar la espera configurada.'
                  : active.response
                    ? 'No hay una respuesta 0430 válida y correlacionada guardada.'
                    : 'No hay una solicitud 0420 guardada para este intento.'
              : !execution.messages
                ? execution.frameGenerated
                  ? 'Esta ejecución no tiene mensajería guardada. Los nuevos envíos mostrarán sus campos aquí.'
                  : 'No se generó una trama para este intento.'
                : 'No se recibió una respuesta ISO8583 válida y correlacionada para mostrar.'}
          </p>
        )}
      </div>
      <p className="inspector-footnote">
        <Icon name="shield" size={14} /> PAN enmascarado · PIN, Track 2 y criptogramas protegidos
      </p>
      <p className="message-correlation">
        STAN {execution.correlation?.stan ?? '—'} · RRN {execution.correlation?.rrn ?? '—'}
      </p>
    </section>
  );
}
