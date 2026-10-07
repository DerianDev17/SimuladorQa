import type { CaptureEvidence } from '../../../../packages/domain/src/capture-evidence';

export function CaptureEvidenceView({ report }: { report: CaptureEvidence }) {
  const messages = report.captures.reduce((sum, capture) => sum + capture.messages, 0);
  const supported = report.captures.filter((capture) => capture.messages > 0).length;
  return (
    <div className="capture-evidence" aria-label="Evidencia de capturas">
      <span className="eyebrow">CAPTURAS INSPECCIONADAS</span>
      <h3>
        {report.captures.length} archivos · {messages} mensajes
      </h3>
      <p>
        Encapsulado verificado en {supported} capturas del enlace BANRED. Ambiente pendiente de
        confirmar; no se aplica automáticamente al escenario seleccionado.
      </p>
      <dl>
        <div>
          <dt>Longitud</dt>
          <dd>2 bytes, big endian; incluye el prefijo</dd>
        </div>
        <div>
          <dt>Estructura</dt>
          <dd>Cabecera de 12 bytes · MTI ASCII · bitmap de 128 bits en ASCII hex</dd>
        </div>
        <div>
          <dt>Mensajes observados</dt>
          <dd>
            {report.profile.minimumObservedBytes}–{report.profile.maximumObservedBytes} bytes
          </dd>
        </div>
      </dl>
      <details>
        <summary>Ver archivos y MTI</summary>
        <ul>
          {report.captures.map((capture) => (
            <li key={capture.id}>
              <strong>{capture.file}</strong>
              <small>
                {capture.messages
                  ? Object.entries(capture.mtiCounts)
                      .map(([mti, count]) => `${mti}: ${count}`)
                      .join(' · ')
                  : 'Formato pendiente de identificar'}
              </small>
              {capture.conflictingDirections > 0 && (
                <small>
                  {capture.conflictingDirections} direcciones con solapamientos distintos, fuera del
                  perfil verificado.
                </small>
              )}
            </li>
          ))}
        </ul>
      </details>
      <small>
        Revisión local: {new Date(report.inspectedAt).toLocaleString()}. Los nombres de archivo y
        MTI no validan el resultado financiero ni la causa de un reverso. Campos y RAW requieren
        diccionario y sanitización.
      </small>
    </div>
  );
}
