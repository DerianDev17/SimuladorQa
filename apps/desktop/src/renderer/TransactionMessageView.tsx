import { useId, useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import {
  isoFieldLabels,
  protectedIsoValue,
  publicEmvTags,
} from '../../../../packages/domain/src/iso-message';
import { Icon } from './Icon';
import type { InspectionMessage } from './transaction-inspection';
import { formatIsoMessageText } from './transaction-message-text';
import type { DesktopClient } from './desktop-client';
import { useSessionMessages } from './useSessionMessages';

export function TransactionMessageView({
  execution,
  selectedMessage,
  onSelectMessage,
  messageAlternative,
  client,
  visible = true,
}: {
  execution: BalanceExecution;
  selectedMessage?: InspectionMessage | undefined;
  onSelectMessage?: (message: InspectionMessage) => void;
  messageAlternative?: { label: string; open: () => void } | undefined;
  client?: DesktopClient | undefined;
  visible?: boolean;
}) {
  const tabs: {
    key: InspectionMessage;
    label: string;
    message: NonNullable<BalanceExecution['messages']>['response'];
    attempted: boolean;
    response: boolean;
  }[] = [
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
            key: 'reversal-request' as const,
            label: 'Reverso (0420)',
            message: execution.reversal.messages?.request,
            attempted: execution.reversal.transmissionAttempted,
            response: false,
          },
          {
            key: 'reversal-response' as const,
            label: 'Respuesta reverso (0430)',
            message: execution.reversal.messages?.response,
            attempted: execution.reversal.transmissionAttempted,
            response: true,
          },
        ]
      : []),
  ];
  const [localSelection, setLocalSelection] = useState<InspectionMessage>();
  const selected = onSelectMessage ? selectedMessage : localSelection;
  function setSelected(message: InspectionMessage) {
    if (onSelectMessage) onSelectMessage(message);
    else setLocalSelection(message);
  }
  const [expanded, setExpanded] = useState(false);
  const [format, setFormat] = useState<'text' | 'fields'>('text');
  const [complete, setComplete] = useState(true);
  const session = useSessionMessages(client, execution, visible && complete);
  const [fieldSelection, setFieldSelection] = useState<{ message: string; number: number }>();
  // Follow progress until the operator explicitly selects a message.
  const active =
    tabs.find((tab) => tab.key === selected) ??
    [...tabs].reverse().find((tab) => tab.message) ??
    tabs[0]!;
  const fullMessage = active.message ? session.value?.messages[active.message.mti] : undefined;
  const message = fullMessage ?? active.message;
  const selectedField =
    fieldSelection?.message === active.key
      ? message?.fields.find((field) => field.number === fieldSelection.number)
      : undefined;
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
            <div className="message-format" role="group" aria-label="Formato del mensaje">
              <button
                className="secondary"
                aria-pressed={format === 'text'}
                onClick={() => setFormat('text')}
              >
                Texto legible
              </button>
              <button
                className="secondary"
                aria-pressed={format === 'fields'}
                onClick={() => setFormat('fields')}
              >
                Campos
              </button>
            </div>
            <div className="message-session">
              <label>
                <input
                  type="checkbox"
                  checked={complete}
                  onChange={(event) => setComplete(event.target.checked)}
                />
                Mostrar todos los valores de esta sesión
              </label>
              {complete && (
                <p role="status">
                  {fullMessage
                    ? 'Valores completos de QA · solo en memoria durante 15 minutos. Binarios en HEX; PIN Block y criptogramas conservan su cifrado.'
                    : (session.error ??
                      'El original sin máscara no está disponible en esta sesión. Se muestra la versión protegida del diario; las máscaras guardadas no se pueden deshacer.')}
                </p>
              )}
              {complete && !fullMessage && client && (
                <button className="text-button" onClick={session.refresh}>
                  Actualizar mensajes de sesión
                </button>
              )}
            </div>
            {format === 'text' && (
              <pre className="message-readable" aria-label="Trama en texto legible" tabIndex={0}>
                {formatIsoMessageText(message)}
              </pre>
            )}
            <div hidden={format !== 'fields'}>
              <div className={`message-fields-scroll${expanded ? ' is-expanded' : ''}`}>
                <table className="inspector-table" aria-label="Campos del mensaje">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Descripción</th>
                      <th>Valor</th>
                      <th>
                        <span className="visually-hidden">Detalle del campo</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>MTI</td>
                      <td>Tipo de mensaje</td>
                      <td className="iso-field-value">{message.mti}</td>
                      <td />
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
                        <td>
                          <button
                            className="text-button"
                            aria-label={`Ver detalle del campo ${field.number}`}
                            aria-pressed={selectedField?.number === field.number}
                            onClick={() =>
                              setFieldSelection(
                                selectedField?.number === field.number
                                  ? undefined
                                  : { message: active.key, number: field.number },
                              )
                            }
                          >
                            Detalle
                          </button>
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
                            <td>
                              {publicEmvTags[tag.tag]?.label ??
                                (fullMessage ? 'Tag EMV' : 'Dato protegido')}
                            </td>
                            <td className="iso-field-value">{tag.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
              </div>
              {selectedField && (
                <section
                  className="execution-stage-detail"
                  aria-label="Detalle del campo seleccionado"
                >
                  <h3>
                    F{selectedField.number} · {isoFieldLabels[selectedField.number] ?? 'Campo'}
                  </h3>
                  <p>Mensaje {message.mti}</p>
                  <p className="iso-field-value">
                    {selectedField.tags
                      ? `${selectedField.tags.length} tags; consulta el desglose EMV.`
                      : selectedField.value.trim() || 'Vacío'}
                  </p>
                  {selectedField.value === protectedIsoValue && (
                    <p>
                      Contenido sensible o privado protegido. No se conserva su valor original en
                      esta vista.
                    </p>
                  )}
                  <button className="text-button" onClick={() => setFieldSelection(undefined)}>
                    Cerrar detalle del campo
                  </button>
                </section>
              )}
              <button
                className="text-button message-expand"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Compactar tabla' : 'Ver todos los campos sin desplazamiento interno'}
              </button>
            </div>
          </>
        ) : (
          <div className="message-empty" role="status">
            <p>
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
                    ? 'Esta ejecución no tiene mensajería guardada. Su REQ y RESP no se pueden recuperar del diario local. Las operaciones nuevas guardan sus mensajes automáticamente.'
                    : 'No se generó una trama para este intento.'
                  : 'No se recibió una respuesta ISO8583 válida y correlacionada para mostrar.'}
            </p>
            {!execution.messages && messageAlternative && (
              <button className="secondary" onClick={messageAlternative.open}>
                {messageAlternative.label}
              </button>
            )}
          </div>
        )}
      </div>
      <p className="inspector-footnote">
        <Icon name="shield" size={14} />{' '}
        {fullMessage
          ? 'Vista completa temporal · el historial conserva la versión protegida'
          : 'PAN enmascarado · PIN, Track 2 y criptogramas protegidos'}
      </p>
      <p className="message-correlation">
        STAN {execution.correlation?.stan ?? '—'} · RRN {execution.correlation?.rrn ?? '—'}
      </p>
    </section>
  );
}
