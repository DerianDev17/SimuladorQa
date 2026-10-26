import { useEffect, useMemo, useState } from 'react';
import type { CardReaderSnapshot } from '../../../../packages/domain/src/card-reader';
import type { Environment } from '../../../../packages/domain/src/index';
import type { MediatorLiveRow } from '../../../../packages/domain/src/mediator-live';
import type { SwitchConnectionSnapshot } from '../../../../packages/domain/src/switch-connection';
import type { Result } from '../../../../packages/shared/src/contracts';
import { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import './dashboard.css';

const client = new DesktopClient(window.desktop);

interface Props {
  environment: Environment | undefined;
  connection: SwitchConnectionSnapshot | undefined;
  connectionError: string | undefined;
  busy: boolean;
  onNewTransaction: () => void;
}

export function DashboardView({
  environment,
  connection,
  connectionError,
  busy,
  onNewTransaction,
}: Props) {
  const [mediatorRows, setMediatorRows] = useState<readonly MediatorLiveRow[]>([]);
  const [mediatorHasMore, setMediatorHasMore] = useState(false);
  const [reader, setReader] = useState<CardReaderSnapshot>();
  const [readerError, setReaderError] = useState(false);
  const [feedError, setFeedError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>();
  const [paused, setPaused] = useState(false);
  const [selectedAtm, setSelectedAtm] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setFeedError(undefined);
    setPaused(false);
  }, [environment]);

  useEffect(() => {
    let active = true;
    let eventSeen = false;
    const apply = (result: Result<CardReaderSnapshot>) => {
      if (!active) return;
      if (result.ok) {
        setReader(result.value);
        setReaderError(false);
      } else {
        setReader(undefined);
        setReaderError(true);
      }
    };
    const unsubscribe = window.desktop?.onReaderSnapshot((result) => {
      eventSeen = true;
      apply(result);
    });
    void client
      .call((api) => api.getReaderSnapshot())
      .then((result) => {
        if (!eventSeen) apply(result);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!environment || paused) return;
    const selectedEnvironment = environment;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const result = await client.call((api) =>
        api.getMediatorLive({
          mode: 'live',
          environment: selectedEnvironment,
          entityId: 205,
          channelId: 1,
          limit: 50,
        }),
      );
      if (!active) return;
      if (result.ok) {
        setMediatorRows(result.value.rows);
        setMediatorHasMore(result.value.hasMore);
        setUpdatedAt(Date.parse(result.value.queriedAt));
        setFeedError(undefined);
      } else {
        setFeedError(result.error.message);
      }
      setLoading(false);
      timer = setTimeout(
        () => void poll(),
        result.ok ? 5000 : result.error.code === 'CONFLICT' ? 1000 : 15000,
      );
    }
    setLoading(true);
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [environment, paused]);

  const atmOptions = useMemo(() => {
    const choices = new Map<string, string>();
    for (const row of mediatorRows) if (row.terminalId) choices.set(row.terminalId, row.terminalId);
    return [...choices].sort((a, b) => a[1].localeCompare(b[1]));
  }, [mediatorRows]);
  const liveShown = mediatorRows.filter((row) => {
    if (selectedAtm && row.terminalId !== selectedAtm) return false;
    const term = search.trim().toLocaleLowerCase('es-EC');
    return (
      !term ||
      [
        row.traceId,
        row.terminalId,
        row.terminalSequence,
        row.transactionCode,
        row.cardReference,
      ].some((part) => part?.toLocaleLowerCase('es-EC').includes(term))
    );
  });
  const readerAvailable = !!reader?.readers.some((device) => device.state !== 'UNAVAILABLE');
  const switchStatus =
    environment !== 'QA'
      ? 'Solo QA'
      : connection?.state === 'CONNECTED'
        ? 'Conectado'
        : connection?.state === 'CONNECTING'
          ? 'Conectando…'
          : connection?.reason === 'TRANSACTION_STARTED'
            ? 'Transacción en curso'
            : connectionError
              ? 'No disponible'
              : 'Desconectado';

  return (
    <div className="dashboard-home">
      <div className="dashboard-home-heading">
        <h1>Estación de pruebas</h1>
        <p>Seguimiento de transacciones y acceso a pruebas.</p>
      </div>
      <div className="dashboard-home-overview">
        <section className="dashboard-home-action" aria-labelledby="dashboard-action-title">
          <span className="dashboard-home-action-icon">
            <Icon name="transaction" size={24} />
          </span>
          <div>
            <h2 id="dashboard-action-title">Nueva transacción</h2>
            <p>Prepara una operación ATM en {environment ?? 'el ambiente seleccionado'}.</p>
          </div>
          <button className="primary" disabled={busy} onClick={onNewTransaction}>
            Nueva transacción <Icon name="arrow" size={17} />
          </button>
        </section>
        <section className="dashboard-home-status" aria-label="Estado de la estación">
          <h2>Estado de la estación</h2>
          <div>
            <span>
              <Icon name="monitor" size={17} /> Switch
            </span>
            <strong>{switchStatus}</strong>
          </div>
          <div>
            <span>
              <Icon name="reader" size={17} /> Lector de tarjetas
            </span>
            <strong>{readerError || !readerAvailable ? 'No disponible' : 'Disponible'}</strong>
          </div>
        </section>
      </div>
      <section className="dashboard-feed" aria-label="Transacciones en vivo">
        <div className="dashboard-feed-heading">
          <div>
            <h2>Transacciones en vivo</h2>
            <span
              className={`dashboard-feed-badge ${paused ? 'paused' : feedError ? 'error' : ''}`}
            >
              <span className="status-dot" />
              {paused
                ? 'En pausa'
                : feedError
                  ? 'Actualización interrumpida'
                  : 'Actualización cada 5 s'}
            </span>
          </div>
          <div className="dashboard-feed-controls">
            <label>
              <span className="visually-hidden">Filtrar por terminal</span>
              <select value={selectedAtm} onChange={(event) => setSelectedAtm(event.target.value)}>
                <option value="">Todos los terminales</option>
                {atmOptions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="visually-hidden">Buscar transacciones</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar tarjeta, código o TraceId"
              />
            </label>
            <button onClick={() => setPaused((value) => !value)} disabled={!environment}>
              {paused ? 'Reanudar' : 'Pausar'}
            </button>
          </div>
        </div>
        <p className="dashboard-feed-scope">
          Mediator · entidad 205 · canal 1 · últimas 50 filas del Journal/Message en QA y PREPROD.
          Hora SQL sin zona confirmada; NOLOCK puede mostrar datos sin confirmar.
        </p>
        {feedError && (
          <p className="dashboard-feed-error" role="alert">
            {feedError} Se volverá a intentar automáticamente.
          </p>
        )}
        <div className="dashboard-feed-scroll">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Terminal</th>
                <th>Referencia de tarjeta</th>
                <th>TrnCode</th>
                <th>Valor registrado</th>
                <th>RetCode</th>
                <th>Secuencia</th>
                <th>TraceId</th>
              </tr>
            </thead>
            <tbody>
              {liveShown.length ? (
                liveShown.map((row) => (
                  <tr key={row.traceId}>
                    <td>{row.occurredAt ?? '—'}</td>
                    <td>{row.terminalId ?? '—'}</td>
                    <td>{row.cardReference ?? '—'}</td>
                    <td>{row.transactionCode ?? '—'}</td>
                    <td>{row.valueText ?? '—'}</td>
                    <td>{row.returnCode ?? '—'}</td>
                    <td>{row.terminalSequence ?? '—'}</td>
                    <td>{row.traceId}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="dashboard-feed-empty">
                    {!environment
                      ? 'Selecciona QA o PREPROD para consultar Mediator.'
                      : loading && !updatedAt
                        ? 'Consultando Mediator…'
                        : mediatorRows.length
                          ? 'No hay filas que coincidan con los filtros.'
                          : feedError
                            ? 'No se pudo consultar Mediator.'
                            : 'No hay filas en la ventana consultada.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="dashboard-feed-footer">
          <span>
            {`${liveShown.length} filas visibles${mediatorHasMore ? ' · hay más anteriores' : ''} · tarjeta protegida`}
          </span>
          <span>
            {updatedAt
              ? `Actualizado ${new Date(updatedAt).toLocaleTimeString('es-EC')}`
              : 'Sin actualizar'}
          </span>
        </div>
      </section>
    </div>
  );
}
