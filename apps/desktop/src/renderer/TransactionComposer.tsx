import { scenarios, transactions } from '../../../../packages/domain/src/index';
import { accountTypes } from '../../../../packages/domain/src/transaction-draft';
import { CardReaderView } from './CardReaderView';
import { DestinationCompatibilityView } from './DestinationCompatibilityView';
import { DraftSummary } from './DraftSummary';
import { Icon } from './Icon';
import { TransactionError } from './TransactionError';
import type { TransactionPreparation } from './useTransactionPreparation';
export function TransactionComposer({ preparation }: { preparation: TransactionPreparation }) {
  const {
    dataHeading,
    atmInput,
    selectedAtm,
    fieldsDisabled,
    loading,
    atms,
    invalidate,
    setAtmId,
    catalog,
    catalogError,
    onNavigate,
    cardHeading,
    visible,
    transaction,
    snapshot,
    selectedCard,
    chooseCard,
    applySavedCardAccount,
    clearCard,
    onCardAvailable,
    onCardReading,
    withReversal,
    setTransaction,
    setWithReversal,
    setAmount,
    account,
    original,
    setAccount,
    monetary,
    amountInput,
    amountInvalid,
    amount,
    receiptPreference,
    setReceiptPreference,
    reversalDelay,
    setReversalDelay,
    error,
    balanceContext,
    balanceRequestId,
    executeBalance,
    executingBalance,
    requestOperation,
    optionsOpen,
    setOptionsOpen,
    sendHint,
    requestReset,
    scenario,
    setScenario,
    onRefresh,
    balanceReadiness,
    sendSetupLoading,
    prepare,
    reviewing,
    checkingBalance,
    blockers,
    sendPlan,
    review,
    checks,
    sendSetupError,
  } = preparation;
  const depositQuickAmounts = ['10.00', '20.00', '50.00', '100.00'] as const;
  return (
    <section
      className="panel transaction-context transaction-composer"
      aria-labelledby="transaction-context-title"
    >
      <div className="panel-heading">
        <h2 id="transaction-context-title" ref={dataHeading} tabIndex={-1}>
          Datos de la transacción
        </h2>
      </div>
      <div className="transaction-fields">
        <div className="transaction-context-selectors">
          <label>
            Cajero (ATM)
            <span className="composer-select with-caption">
              <Icon name="atm" size={21} />
              <select
                ref={atmInput}
                aria-label="Perfil ATM"
                value={selectedAtm?.id ?? ''}
                disabled={fieldsDisabled || loading || !atms.length}
                onChange={(event) => {
                  invalidate();
                  setAtmId(event.target.value);
                }}
              >
                <option value="">
                  {loading
                    ? 'Cargando perfiles…'
                    : atms.length
                      ? 'Selecciona un ATM'
                      : 'Sin ATM activos en este ambiente'}
                </option>
                {atms.map((atm) => (
                  <option key={atm.id} value={atm.id}>
                    {atm.alias}
                  </option>
                ))}
              </select>
              <small>
                {catalog?.entities.find((entity) => entity.id === selectedAtm?.entityId)?.name ??
                  'Selecciona un cajero'}
              </small>
            </span>
          </label>
        </div>
        {!atms.length && !loading && (
          <div className="empty-profile-action">
            <button
              className="text-button"
              disabled={fieldsDisabled || !catalog || !!catalogError}
              onClick={() =>
                onNavigate(catalog?.entities.some((entity) => entity.active) ? 'atms' : 'entities')
              }
            >
              {catalog?.entities.some((entity) => entity.active) ? 'Crear ATM' : 'Crear entidad'}
            </button>
          </div>
        )}
        {catalogError && (
          <div className="inline-error" role="alert">
            <strong>{catalogError.message}</strong>
            <small>{catalogError.code}</small>
          </div>
        )}
        <section className="transaction-card-section" aria-labelledby="transaction-card-title">
          <div className="panel-heading">
            <h2 id="transaction-card-title" ref={cardHeading} tabIndex={-1}>
              Tarjeta
            </h2>
          </div>
          {visible && (
            <CardReaderView
              transaction
              {...(snapshot ? { environment: snapshot.environment } : {})}
              disabled={fieldsDisabled}
              selectedReadId={selectedCard?.readId}
              onUseCard={chooseCard}
              onSavedProfileAccount={applySavedCardAccount}
              onClearCard={clearCard}
              onAvailableCardChange={onCardAvailable}
              onReadingChange={onCardReading}
            />
          )}
        </section>
        <label>
          Tipo de Transacción
          <span className="composer-select">
            <Icon name="transaction" size={21} />
            <select
              aria-label="Transacción"
              value={
                transaction === 'WITHDRAWAL_APPROVED' && withReversal
                  ? 'WITHDRAWAL_REVERSAL'
                  : transaction
              }
              disabled={fieldsDisabled}
              onChange={(event) => {
                if (event.target.value === 'WITHDRAWAL_REVERSAL') {
                  invalidate();
                  setTransaction('WITHDRAWAL_APPROVED');
                  setWithReversal(true);
                  setAmount('');
                  return;
                }
                const selected = transactions.find((item) => item.id === event.target.value);
                if (selected) {
                  invalidate();
                  setTransaction(selected.id);
                  setWithReversal(false);
                  setAmount('');
                }
              }}
            >
              {transactions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
              <option value="WITHDRAWAL_REVERSAL">Retiro aprobado + reverso</option>
            </select>
          </span>
        </label>
        <label>
          Cuenta
          <span className="composer-select">
            <Icon name="entity" size={21} />
            <select
              aria-label="Cuenta"
              value={account}
              disabled={fieldsDisabled || original}
              onChange={(event) => {
                const selected = accountTypes.find((item) => item.id === event.target.value);
                if (selected) {
                  invalidate();
                  setAccount(selected.id);
                }
              }}
            >
              {accountTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </span>
          {original && <small className="field-feedback">Pendiente de transacción original</small>}
        </label>
        {monetary && (
          <>
            <label className="withdrawal-amount-input">
              Monto de prueba
              <span className="money-input">
                <span aria-hidden="true">USD</span>
                <input
                  ref={amountInput}
                  aria-label="Monto de prueba"
                  aria-invalid={amountInvalid}
                  aria-describedby="draft-amount-help"
                  inputMode="decimal"
                  value={amount}
                  maxLength={14}
                  placeholder="0.00"
                  disabled={fieldsDisabled}
                  onChange={(event) => {
                    invalidate();
                    setAmount(event.target.value);
                  }}
                />
              </span>
              <small
                id="draft-amount-help"
                className={amountInvalid ? 'field-feedback invalid' : 'field-feedback'}
                aria-live="polite"
              >
                {amountInvalid
                  ? 'Usa un monto positivo, punto y dos decimales; hasta 10 dígitos enteros.'
                  : transaction === 'DEPOSIT'
                    ? 'Depósito QA en ahorros/USD. El monto aprobado por el host no confirma el abono en Core.'
                    : 'Escribe el monto que deseas probar, con punto y dos decimales (ej. 75.25).'}
              </small>
            </label>
            {transaction === 'DEPOSIT' && (
              <div
                className="deposit-quick-amounts"
                role="group"
                aria-label="Importes rápidos para depósito"
              >
                <span>Importes rápidos</span>
                {depositQuickAmounts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="secondary"
                    aria-pressed={amount === value}
                    disabled={fieldsDisabled}
                    onClick={() => {
                      invalidate();
                      setAmount(value);
                      amountInput.current?.focus();
                    }}
                  >
                    USD {Number(value).toFixed(2)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {monetary && transaction !== 'DEPOSIT' && (
          <details className="composer-extra-options" open={withReversal}>
            <summary>Comprobante y reverso</summary>
            {monetary && (
              <fieldset
                className="receipt-options"
                disabled={fieldsDisabled}
                aria-describedby="receipt-choice-help"
              >
                <legend>Comprobante del simulador</legend>
                <div className="receipt-choices">
                  {(
                    [
                      ['WITHOUT_PRINT', 'Sin impresión', 'Solo resultado en pantalla', 'monitor'],
                      ['WITH_PRINT', 'Con impresión', 'Vista previa al aprobarse', 'printer'],
                    ] as const
                  ).map(([value, label, description, icon]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="withdrawal-receipt"
                        value={value}
                        checked={receiptPreference === value}
                        onChange={() => setReceiptPreference(value)}
                      />
                      <span>
                        <Icon name={icon} size={19} />
                        <span>
                          <strong>{label}</strong>
                          <small>{description}</small>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p id="receipt-choice-help">Impresión local, sin comisión adicional al host.</p>
              </fieldset>
            )}
            {transaction === 'WITHDRAWAL_APPROVED' && (
              <fieldset
                className="receipt-options withdrawal-flow-options"
                disabled={fieldsDisabled}
              >
                <legend>Flujo de la prueba</legend>
                <div className="receipt-choices">
                  <label>
                    <input
                      type="radio"
                      name="withdrawal-flow"
                      checked={!withReversal}
                      onChange={() => {
                        invalidate();
                        setWithReversal(false);
                      }}
                    />
                    <span>
                      <strong>Solo retiro</strong>
                    </span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="withdrawal-flow"
                      checked={withReversal}
                      onChange={() => {
                        invalidate();
                        setWithReversal(true);
                      }}
                    />
                    <span>
                      <strong>Retiro + reverso</strong>
                    </span>
                  </label>
                </div>
                {withReversal && (
                  <>
                    <label>
                      Espera después de la aprobación
                      <select
                        aria-label="Espera para el reverso"
                        value={reversalDelay}
                        onChange={(event) => setReversalDelay(Number(event.target.value))}
                      >
                        {[1, 3, 5, 10, 20, 30].map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {seconds} segundos
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      Tras aprobarse el retiro, el simulador enviará su reverso total. Prueba sin
                      entrega de efectivo.
                    </p>
                  </>
                )}
              </fieldset>
            )}
          </details>
        )}
      </div>

      {error?.target !== 'review' && <TransactionError error={error} />}
      <div className="composer-footer">
        <div className="transaction-send-actions">
          <button
            className="primary"
            disabled={fieldsDisabled || !balanceContext || !!balanceRequestId}
            onClick={() => void executeBalance()}
            aria-describedby="send-blocked-note"
          >
            <Icon name="play" size={17} />
            {executingBalance
              ? requestOperation === 'DEPOSIT'
                ? 'Procesando depósito…'
                : requestOperation === 'WITHDRAWAL'
                  ? 'Procesando retiro…'
                  : 'Consultando saldo…'
              : 'Ejecutar Transacción'}
          </button>
        </div>
        <button
          className="composer-settings"
          aria-label="Opciones y detalles técnicos"
          aria-controls="transaction-options"
          aria-expanded={optionsOpen}
          onClick={() => setOptionsOpen((open) => !open)}
          title="Opciones y detalles técnicos"
        >
          <Icon name="settings" size={19} />
        </button>
      </div>
      <p id="send-blocked-note" className="send-status-note" aria-live="polite">
        {sendHint}
      </p>
      <details
        className="composer-options"
        id="transaction-options"
        open={optionsOpen}
        onToggle={(event) => setOptionsOpen(event.currentTarget.open)}
        aria-label="Opciones y detalles técnicos"
      >
        <summary>Opciones y detalles técnicos</summary>
        <div className="composer-options-content">
          <button
            className="text-button"
            aria-label="Limpiar borrador"
            disabled={fieldsDisabled}
            onClick={requestReset}
          >
            <Icon name="trash" size={16} />
            Limpiar
          </button>

          <label>
            Escenario
            <select
              aria-label="Escenario"
              value={scenario}
              disabled={fieldsDisabled}
              onChange={(event) => {
                const selected = scenarios.find((item) => item.id === event.target.value);
                if (selected) {
                  invalidate();
                  setScenario(selected.id);
                }
              }}
            >
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="profile-tools">
            <button
              className="text-button"
              disabled={fieldsDisabled}
              onClick={() => onNavigate('atms')}
            >
              Administrar perfiles
            </button>
            <button
              className="text-button"
              aria-label="Recargar perfiles"
              title="Recargar perfiles"
              disabled={loading || fieldsDisabled || !snapshot}
              onClick={() => {
                invalidate();
                void onRefresh();
              }}
            >
              <Icon name="history" size={16} />
            </button>
          </div>
          {balanceReadiness?.sequencesRemaining !== undefined && (
            <p className="form-note">
              Secuencias QA reservadas disponibles: {balanceReadiness.sequencesRemaining}.
              {balanceReadiness.sequencesRemaining <= 1 &&
                ' Solicita un nuevo pool aprobado antes de agotarlas; no se reutilizan secuencias consumidas.'}
            </p>
          )}
          <details className="inline-details">
            <summary>Sobre este escenario</summary>
            <p>{scenarios.find((item) => item.id === scenario)?.description}</p>
          </details>
          <label>
            <span className="visually-hidden">Plantilla documental</span>
            <select
              aria-label="Plantilla documental"
              value=""
              disabled={fieldsDisabled || !snapshot?.documentedOperations.length}
              onChange={(event) => {
                const selected = snapshot?.documentedOperations.find(
                  (item) => `${item.transaction}:${item.account}` === event.target.value,
                );
                if (!selected) return;
                invalidate();
                setTransaction(selected.transaction);
                setWithReversal(false);
                setAccount(selected.account);
                setAmount('');
              }}
            >
              <option value="">Plantillas documentales</option>
              {snapshot?.documentedOperations.map((item) => (
                <option
                  key={`${item.transaction}:${item.account}`}
                  value={`${item.transaction}:${item.account}`}
                >
                  {transactions.find((entry) => entry.id === item.transaction)?.label} ·{' '}
                  {accountTypes.find((entry) => entry.id === item.account)?.label} · {item.code}
                </option>
              ))}
            </select>
          </label>

          <button
            className="secondary"
            disabled={
              fieldsDisabled ||
              sendSetupLoading ||
              loading ||
              !snapshot ||
              !catalog ||
              !!catalogError
            }
            onClick={() => void prepare()}
          >
            {reviewing ? 'Revisando…' : 'Revisar transacción'} <Icon name="check" size={16} />
          </button>
          <p className="form-note">Revisión documental opcional. No es un requisito para enviar.</p>
          <dl className="transaction-preview" aria-label="Resumen de la transacción">
            {[
              ['Ambiente', snapshot?.environment ?? 'Sin verificar'],
              ['ATM', selectedAtm?.alias ?? 'Selecciona un ATM'],
              [
                'Escenario',
                scenarios.find((item) => item.id === scenario)?.label ?? 'Sin verificar',
              ],
              [
                'Transacción',
                transactions.find((item) => item.id === transaction)?.label ?? 'Sin verificar',
              ],
              [
                'Cuenta',
                original
                  ? 'Pendiente del original'
                  : (accountTypes.find((item) => item.id === account)?.label ?? 'Sin verificar'),
              ],
              ...(monetary ? [['Monto de prueba', amount || 'Escribe el monto']] : []),
              [
                'Tarjeta',
                selectedCard?.panMasked ??
                  (selectedCard ? 'Número no disponible en el chip' : 'Pendiente de seleccionar'),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {checkingBalance && <p role="status">Comprobando disponibilidad…</p>}
          {balanceReadiness && !balanceReadiness.ready && (
            <div role="status" aria-label="Disponibilidad de la transacción">
              <strong>Dependencias de esta transacción</strong>
              <ul>
                {balanceReadiness.blockers.map((item) => (
                  <li key={item.id}>{item.label}</li>
                ))}
              </ul>
            </div>
          )}
          {sendPlan && (
            <div className="send-plan-status" role="status" aria-label="Plan de envío">
              <strong>Configuración de envío</strong>
              <span>
                {sendPlan.endpoint.host}:{sendPlan.endpoint.port}
              </span>
              <small>
                Modo documental:{' '}
                {sendPlan.trigger === 'ON_CLICK' ? 'Al pulsar Enviar' : 'Después de revisar'}
              </small>
              <small>Plan documental · sin transmisión.</small>
            </div>
          )}
          {review && (
            <>
              <p role="status">Revisión documental · {review.environment}</p>
              <DraftSummary review={review} compact />
            </>
          )}
          {review?.destinationCompatibility && (
            <DestinationCompatibilityView report={review.destinationCompatibility} />
          )}
          <details className="inline-details preparation-details">
            <summary>Preparación y pendientes documentales</summary>
            <div className="transaction-readiness">
              <div className="local-draft-checks" aria-label="Preparación local">
                <h3>Datos del borrador</h3>
                <ul>
                  {checks.map((check) => (
                    <li key={check.key}>
                      <span
                        className={check.complete ? 'local-check complete' : 'local-check'}
                        aria-label={check.complete ? 'Completado' : 'Pendiente'}
                      >
                        {check.complete ? '✓' : '○'}
                      </span>
                      <div>
                        <strong>{check.label}</strong>
                        {!check.complete && <p>{check.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="send-requirements">
                <h3>Referencias documentales</h3>
                <ul>
                  {blockers.map((blocker) => (
                    <li key={blocker.id}>
                      <details className="inline-details">
                        <summary>{blocker.label}</summary>
                        <p>{blocker.description}</p>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
          <button
            className="text-button"
            disabled={fieldsDisabled}
            onClick={() => onNavigate('settings')}
          >
            Configurar envío <Icon name="arrow" size={14} />
          </button>
        </div>
      </details>
      {sendSetupError && (
        <p className="inline-error" role="alert">
          {sendSetupError}
        </p>
      )}
      {balanceReadiness?.sequencesRemaining !== undefined &&
        balanceReadiness.sequencesRemaining <= 1 && (
          <p className="form-note" role="status">
            {balanceReadiness.sequencesRemaining === 1
              ? 'Queda una secuencia QA reservada.'
              : 'No quedan secuencias QA reservadas.'}{' '}
            Se necesita un nuevo pool aprobado para continuar cuando se agote.
          </p>
        )}
    </section>
  );
}
