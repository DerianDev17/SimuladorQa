import type { AtmProfile } from '../../../../packages/domain/src/catalogs';

export function HistoryAtmFilter({
  atms,
  value,
  onChange,
}: {
  atms: readonly AtmProfile[];
  value: string;
  onChange(value: string): void;
}) {
  const known = atms.some((atm) => atm.id === value);
  return (
    <div className="history-atm-filter">
      <label>
        ATM del historial
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Todos los ATM</option>
          {value && !known && <option value={value}>ATM fuera del catálogo · {value}</option>}
          {atms.map((atm) => (
            <option key={atm.id} value={atm.id}>
              {atm.alias} · {atm.terminalId}
              {!atm.active ? ' · Inactivo' : ''}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary>Buscar por UUID</summary>
        <label>
          ATM del historial (UUID)
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="UUID de un ATM, incluso eliminado"
          />
        </label>
      </details>
    </div>
  );
}
