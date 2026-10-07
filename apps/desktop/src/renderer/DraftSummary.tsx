import { scenarios, transactions } from '../../../../packages/domain/src/index';
import { accountTypes, needsOriginal } from '../../../../packages/domain/src/transaction-draft';
import type { ReviewedDraft } from '../../../../packages/shared/src/contracts';

export function DraftSummary({ review }: { review: ReviewedDraft }) {
  return (
    <section className="draft-summary" aria-label="Contexto revisado">
      <div className="panel-heading">
        <h3>Contexto revisado</h3>
        <span className="pill amber">Envío bloqueado</span>
      </div>
      <dl>
        {[
          ['Ambiente', review.environment],
          [
            'Escenario',
            scenarios.find((item) => item.id === review.scenario)?.label ?? 'Sin verificar',
          ],
          [
            'Operación',
            transactions.find((item) => item.id === review.transaction)?.label ?? 'Sin verificar',
          ],
          [
            'ATM',
            review.atm
              ? `${review.atm.alias} · versión ${review.atm.revision} · borrador`
              : 'Sin ATM seleccionado',
          ],
          [
            'Cuenta',
            review.account
              ? (accountTypes.find((item) => item.id === review.account)?.label ?? 'Sin verificar')
              : 'Pendiente del original',
          ],
          ['Monto de borrador', review.amount ?? 'Sin monto definido'],
          [
            'Código documental CMS',
            review.operation?.code ??
              (needsOriginal(review.transaction)
                ? 'Pendiente del original'
                : 'Sin código documentado'),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>
        Revisión local:{' '}
        <time dateTime={review.reviewedAt}>
          {new Date(review.reviewedAt).toLocaleString('es-EC')}
        </time>
      </p>
      <details>
        <summary>Referencia de revisión</summary>
        <code>{review.reviewId}</code>
        {review.operation && (
          <p>
            {review.operation.source.title} v{review.operation.source.version} · p.{' '}
            {review.operation.source.page}
          </p>
        )}
      </details>
      <small>
        Este resumen conserva el contexto comprobado en esa revisión. Revisa nuevamente después de
        modificarlo.
      </small>
    </section>
  );
}
