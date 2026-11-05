import { useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import { executionStages, type InspectionMessage } from './transaction-inspection';

export function TransactionFlowView({
  execution,
  persisted,
  onMessage,
  onEvidence,
}: {
  execution: BalanceExecution;
  persisted: boolean;
  onMessage: (message: InspectionMessage) => void;
  onEvidence: () => void;
}) {
  const stages = executionStages(execution, persisted);
  const [selected, setSelected] = useState('response');
  const stage = stages.find((item) => item.id === selected) ?? stages[0]!;
  const states = {
    complete: 'Con evidencia',
    attention: 'Por revisar',
    pending: 'Pendiente',
    unavailable: 'Sin evidencia',
  };
  return (
    <section className="transaction-live-flow" aria-label="Flujo de la transacción">
      <div className="execution-stages" aria-label="Etapas registradas">
        {stages.map((item) => (
          <button
            key={item.id}
            className={`execution-stage is-${item.state}`}
            aria-pressed={stage.id === item.id}
            aria-label={`${item.label}: ${states[item.state]}`}
            onClick={() => setSelected(item.id)}
          >
            <span aria-hidden="true">
              {item.state === 'complete' ? '✓' : item.state === 'attention' ? '!' : '○'}
            </span>
            {item.label}
          </button>
        ))}
      </div>
      <div className="execution-stage-detail" aria-live="polite">
        <div className="panel-heading">
          <h3>{stage.label}</h3>
          <span className="pill neutral">{states[stage.state]}</span>
        </div>
        <p>{stage.detail}</p>
        {stage.message ? (
          <button className="text-button" onClick={() => onMessage(stage.message!)}>
            Abrir mensaje →
          </button>
        ) : (
          <button className="text-button" onClick={onEvidence}>
            Consultar evidencia →
          </button>
        )}
      </div>
      <p className="history-scope">
        Evidencia del simulador · los tiempos por etapa no están registrados.
      </p>
    </section>
  );
}
