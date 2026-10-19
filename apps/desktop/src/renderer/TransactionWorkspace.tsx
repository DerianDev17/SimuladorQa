import { useCallback, useEffect, useRef, useState } from 'react';
import { scenarios, transactions } from '../../../../packages/domain/src/index';
import type { Scenario, TransactionType } from '../../../../packages/domain/src/index';
import { selectableAtms } from '../../../../packages/domain/src/catalogs';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import {
  accountTypes,
  draftBlockers,
  isDraftAmount,
  needsAmount,
  needsOriginal,
} from '../../../../packages/domain/src/transaction-draft';
import type { AccountType, DraftRequest } from '../../../../packages/domain/src/transaction-draft';
import { parseDraftRequest } from '../../../../packages/domain/src/transaction-draft';
import type {
  AppSnapshot,
  ErrorCode,
  ReviewedDraft,
  Result,
} from '../../../../packages/shared/src/contracts';
import type { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import { localDraftChecks } from './draft-feedback';
import { DraftSummary } from './DraftSummary';
import { DestinationCompatibilityView } from './DestinationCompatibilityView';
import { CaptureEvidenceView } from './CaptureEvidenceView';
import { CaseLibrary } from './CaseLibrary';
import { CardReaderView } from './CardReaderView';
import type { TransactionCard } from './transaction-card';
import { resolveAtmSelection } from './transaction-setup';
import type { AtmSelection } from './transaction-setup';
import type { SendConfigurationSnapshot } from '../../../../packages/domain/src/send-configuration';
import type { PreparedSendPlan } from '../../../../packages/shared/src/contracts';
import type {
  BalanceReadiness,
  BalanceExecution,
} from '../../../../packages/domain/src/balance-inquiry';
import {
  balanceDeliveryUncertain,
  balanceNotTransmitted,
  balanceResponseConfirmed,
  canStartAfterUnconfirmedBalance,
  withdrawalHostNotApproved,
  withdrawalBlocksNewExecution,
  parseBalanceContextRequest,
} from '../../../../packages/domain/src/balance-inquiry';
import { BalanceExecutionView, executionOutcomeLabel } from './BalanceExecutionView';
import {
  createWithdrawalReceipt,
  type ReceiptPreference,
  type WithdrawalReceipt,
} from '../../../../packages/domain/src/withdrawal-receipt';
import { WithdrawalReceiptDialog } from './WithdrawalReceiptDialog';
import {
  isWithdrawalAmount,
  parseWithdrawalContextRequest,
} from '../../../../packages/domain/src/withdrawal';

interface Props {
  visible: boolean;
  snapshot: AppSnapshot | undefined;
  catalog: CatalogSnapshot | undefined;
  catalogError: { code: ErrorCode; message: string } | undefined;
  loading: boolean;
  disabled: boolean;
  client: DesktopClient;
  onRefresh: () => Promise<void>;
  onReviewingChange: (reviewing: boolean) => void;
  onNavigate: (page: 'entities' | 'atms' | 'settings' | 'history') => void;
  onCatalogChange: (catalog: CatalogSnapshot) => void;
  pendingAtmSelection: AtmSelection | undefined;
  onAtmSelectionApplied: () => void;
}
export function TransactionWorkspace({
  visible,
  snapshot,
  catalog,
  catalogError,
  loading,
  disabled,
  client,
  onRefresh,
  onReviewingChange,
  onNavigate,
  onCatalogChange,
  pendingAtmSelection,
  onAtmSelectionApplied,
}: Props) {
  const [transaction, setTransaction] = useState<TransactionType>('BALANCE');
  const [scenario, setScenario] = useState<Scenario>('LOCAL');
  const [account, setAccount] = useState<AccountType>('SAVINGS');
  const [amount, setAmount] = useState('');
  const [receiptPreference, setReceiptPreference] = useState<ReceiptPreference>('WITHOUT_PRINT');
  const [receipt, setReceipt] = useState<WithdrawalReceipt>();
  const receiptRequest = useRef<string | undefined>(undefined);
  const [atmId, setAtmId] = useState('');
  const [review, setReview] = useState<ReviewedDraft>();
  const [balanceReadiness, setBalanceReadiness] = useState<BalanceReadiness>();
  const [balanceExecution, setBalanceExecution] = useState<BalanceExecution>();
  const [executingBalance, setExecutingBalance] = useState(false);
  const [recoveringBalance, setRecoveringBalance] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [balanceRequestId, setBalanceRequestId] = useState<string>();
  const [requestOperation, setRequestOperation] = useState<'BALANCE' | 'WITHDRAWAL'>('BALANCE');
  const [sessionExecutions, setSessionExecutions] = useState<readonly BalanceExecution[]>([]);
  const [balanceHistory, setBalanceHistory] = useState<readonly BalanceExecution[]>();
  const executionLock = useRef(false);
  useEffect(() => {
    if (!balanceExecution || receiptRequest.current !== balanceExecution.requestId) return;
    const preview = createWithdrawalReceipt(balanceExecution);
    if (preview) {
      receiptRequest.current = undefined;
      setReceipt(preview);
    }
  }, [balanceExecution]);
  useEffect(() => {
    if (!executionLock.current) {
      setBalanceExecution(undefined);
      setBalanceRequestId(undefined);
      setBalanceHistory(undefined);
      setSessionExecutions([]);
      setReceiptPreference('WITHOUT_PRINT');
      setReceipt(undefined);
      receiptRequest.current = undefined;
    }
  }, [snapshot?.environment]);
  const [sendSetup, setSendSetup] = useState<SendConfigurationSnapshot>();
  const [sendPlan, setSendPlan] = useState<PreparedSendPlan>();
  const [sendSetupError, setSendSetupError] = useState('');
  const [sendSetupLoading, setSendSetupLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string; target?: 'review' }>();
  useEffect(() => {
    let active = true;
    if (!visible || !snapshot) return;
    setSendSetup(undefined);
    setSendSetupLoading(true);
    setSendSetupError('');
    void client
      .call((api) => api.getSendConfiguration(snapshot.environment))
      .then((result) => {
        if (!active) return;
        setSendSetupLoading(false);
        if (result.ok) setSendSetup(result.value);
        else setSendSetupError(result.error.message);
      });
    return () => {
      active = false;
    };
  }, [visible, snapshot?.environment, client]);
  useEffect(() => {
    setSendPlan(undefined);
  }, [
    sendSetup?.configuration?.id,
    sendSetup?.configuration?.revision,
    sendSetup?.status,
    sendSetup?.documentedEndpoint?.evidenceId,
    sendSetup?.documentedEndpoint?.host,
    sendSetup?.documentedEndpoint?.port,
  ]);
  const [reviewing, setReviewing] = useState(false);
  const [casesOpen, setCasesOpen] = useState(false);
  const [caseWarning, setCaseWarning] = useState<string>();
  const [selectedCard, setSelectedCard] = useState<TransactionCard>();
  const [cardReading, setCardReading] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const selectedCardRef = useRef<TransactionCard | undefined>(undefined);
  const dataHeading = useRef<HTMLHeadingElement>(null);
  const cardHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const atmInput = useRef<HTMLSelectElement>(null);
  const onCasesOpenChange = useCallback((open: boolean) => setCasesOpen(open), []);
  const workflowBusy =
    reviewing ||
    executingBalance ||
    recoveringBalance ||
    casesOpen ||
    cardReading ||
    discardOpen ||
    !!receipt;
  useEffect(() => {
    onReviewingChange(workflowBusy);
    return () => onReviewingChange(false);
  }, [workflowBusy, onReviewingChange]);
  useEffect(() => {
    if (discardOpen) discardDialog.current?.showModal();
    else discardDialog.current?.close();
  }, [discardOpen]);
  const generation = useRef(0);
  const active = useRef(true);
  const amountInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    generation.current++;
    setReview(undefined);
    setSendPlan(undefined);
    setError(undefined);
    if (!catalog || !selectableAtms(catalog).some((atm) => atm.id === atmId)) setAtmId('');
  }, [catalog, atmId]);

  useEffect(() => {
    if (!pendingAtmSelection || !catalog || !snapshot) return;
    const atm =
      snapshot.environment === pendingAtmSelection.environment
        ? resolveAtmSelection(pendingAtmSelection, catalog)
        : undefined;
    generation.current++;
    setReview(undefined);
    setSendPlan(undefined);
    setError(undefined);
    if (atm) {
      setAtmId(atm.id);
      setCaseWarning(undefined);
    } else
      setCaseWarning(
        'El ATM configurado cambió o no está disponible. Recarga los perfiles para seleccionarlo.',
      );
    onAtmSelectionApplied();
  }, [pendingAtmSelection, catalog, snapshot, onAtmSelectionApplied]);

  const atms =
    catalog && catalog.environment === snapshot?.environment ? selectableAtms(catalog) : [];
  const selectedAtm = atms.find((atm) => atm.id === atmId);
  const original = needsOriginal(transaction);
  const monetary = needsAmount(transaction);
  const operation = original
    ? undefined
    : snapshot?.documentedOperations.find(
        (item) => item.transaction === transaction && item.account === account,
      );
  const fieldsDisabled = disabled || workflowBusy;
  const draft: DraftRequest | undefined = snapshot
    ? {
        environment: snapshot.environment,
        transaction,
        scenario,
        atmId: selectedAtm?.id ?? null,
        atmRevision: selectedAtm?.revision ?? null,
        account: original ? null : account,
        amount: monetary ? amount : null,
      }
    : undefined;
  const blockers = review?.blockers ?? draftBlockers(transaction, !!operation);
  // Main validates the current profile, key, card and deadlines on every request.
  // A separate manual review/readiness round trip is not required to submit it.
  const balanceContext =
    !loading &&
    !catalogError &&
    !sendSetupLoading &&
    sendSetup?.configuration &&
    selectedAtm &&
    scenario === 'LOCAL'
      ? (monetary ? parseWithdrawalContextRequest : parseBalanceContextRequest)({
          draft,
          cardReadId: selectedCard?.readId,
          configurationRevision: sendSetup.configuration.revision,
        })
      : undefined;
  useEffect(() => {
    let current = true;
    if (
      !visible ||
      !monetary ||
      snapshot?.environment !== 'QA' ||
      balanceRequestId ||
      balanceExecution ||
      executionLock.current
    )
      return;
    void client
      .call((api) => api.getWithdrawalHistory('QA'))
      .then((result) => {
        if (!current || executionLock.current) return;
        if (!result.ok) {
          setError({ ...result.error, target: 'review' });
          return;
        }
        const previous =
          result.value.find(withdrawalBlocksNewExecution) ??
          result.value.find(withdrawalHostNotApproved);
        if (previous) {
          setBalanceExecution(previous);
          if (withdrawalBlocksNewExecution(previous)) setBalanceRequestId(previous.requestId);
          setRequestOperation('WITHDRAWAL');
          recordExecution(previous);
        }
      });
    return () => {
      current = false;
    };
  }, [visible, monetary, snapshot?.environment, balanceRequestId, balanceExecution, client]);
  useEffect(() => {
    let current = true;
    setBalanceReadiness(undefined);
    setCheckingBalance(false);
    if (
      !visible ||
      !balanceContext ||
      (!monetary && transaction !== 'BALANCE') ||
      account !== 'SAVINGS' ||
      scenario !== 'LOCAL' ||
      snapshot?.environment !== 'QA'
    )
      return;
    setCheckingBalance(true);
    void client
      .call(
        (api) =>
          monetary
            ? api.getWithdrawalReadiness(balanceContext)
            : api.getBalanceReadiness(balanceContext),
        10000,
      )
      .then((result) => {
        if (!current) return;
        setCheckingBalance(false);
        if (result.ok) setBalanceReadiness(result.value);
        else setError({ ...result.error, target: 'review' });
      });
    return () => {
      current = false;
    };
  }, [
    visible,
    selectedAtm?.id,
    selectedAtm?.revision,
    scenario,
    selectedCard?.readId,
    sendSetup?.configuration?.revision,
    transaction,
    amount,
    account,
    snapshot?.environment,
    client,
  ]);
  const amountInvalid = monetary && amount.length > 0 && !isWithdrawalAmount(amount);
  const checks = localDraftChecks({
    transaction,
    amount,
    environmentVerified: !!snapshot,
    atmSelected: !!selectedAtm,
    catalogAvailable: !!catalog && !loading && !catalogError,
    operationAvailable: !!operation,
    original,
  });

  const errorFeedback = error && (
    <div className="inline-error" role="alert">
      <strong>{error.message}</strong>
      <details>
        <summary>Detalle técnico</summary>
        <code>{error.code}</code>
      </details>
    </div>
  );
  const onCardAvailable = useCallback((card: TransactionCard | undefined) => {
    const selected = selectedCardRef.current;
    if (
      !selected ||
      (selected.readId === card?.readId &&
        selected.readerName === card.readerName &&
        selected.panMasked === card.panMasked &&
        selected.applicationLabel === card.applicationLabel)
    )
      return;
    selectedCardRef.current = undefined;
    setSelectedCard(undefined);
    generation.current++;
    setReview(undefined);
    setSendPlan(undefined);
  }, []);
  const onCardReading = useCallback((reading: boolean) => setCardReading(reading), []);
  function focusStep(index: number) {
    const heading = [dataHeading, cardHeading, reviewHeading][index]?.current;
    heading?.focus();
    heading?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }
  function chooseCard(card: TransactionCard) {
    invalidate();
    selectedCardRef.current = card;
    setSelectedCard(card);
  }
  const hasDraftData =
    transaction !== 'BALANCE' ||
    scenario !== 'LOCAL' ||
    account !== 'SAVINGS' ||
    !!amount ||
    !!atmId ||
    !!selectedCard ||
    !!review;
  function requestReset() {
    if (hasDraftData) setDiscardOpen(true);
    else reset();
  }
  function closeDiscard() {
    discardDialog.current?.close();
    setDiscardOpen(false);
  }
  function reset() {
    invalidate();
    setCaseWarning(undefined);
    selectedCardRef.current = undefined;
    setSelectedCard(undefined);
    focusStep(0);
    setTransaction('BALANCE');
    setScenario('LOCAL');
    setAccount('SAVINGS');
    setAmount('');
    setReceiptPreference('WITHOUT_PRINT');
    setAtmId('');
  }

  function invalidate() {
    generation.current++;
    setReview(undefined);
    setSendPlan(undefined);
    setError(undefined);
    setCaseWarning(undefined);
    setBalanceReadiness(undefined);
    if (
      !executionLock.current &&
      (!balanceExecution || !balanceDeliveryUncertain(balanceExecution))
    ) {
      setBalanceExecution(undefined);
      // An IPC timeout without a recovered record must keep its execution reference.
      if (balanceExecution) setBalanceRequestId(undefined);
    }
  }
  function loadCase(saved: DraftRequest, warning: string | undefined) {
    invalidate();
    selectedCardRef.current = undefined;
    setSelectedCard(undefined);
    setTransaction(saved.transaction);
    setScenario(saved.scenario);
    setAccount(saved.account ?? 'SAVINGS');
    setAmount(saved.amount ?? '');
    setReceiptPreference('WITHOUT_PRINT');
    setAtmId(saved.atmId ?? '');
    setCaseWarning(warning);
  }
  async function prepare() {
    invalidate();
    if (!snapshot || !catalog || loading) return;
    if (monetary && !isDraftAmount(amount)) {
      amountInput.current?.focus();
      setError({
        code: 'VALIDATION_ERROR',
        message: 'Escribe el monto con punto y dos decimales, por ejemplo 100.50.',
      });
      return;
    }
    const revision = generation.current;
    setReviewing(true);
    const result = await client.call((api) =>
      api.reviewDraft({
        environment: snapshot.environment,
        transaction,
        scenario,
        atmId: selectedAtm?.id ?? null,
        atmRevision: selectedAtm?.revision ?? null,
        account: original ? null : account,
        amount: monetary ? amount : null,
      }),
    );
    if (!active.current) return;
    if (revision === generation.current) {
      if (result.ok) {
        setReview(result.value);
        if (sendSetup?.configuration && draft) {
          const plan = await client.call((api) =>
            api.prepareSendPlan({
              draft,
              configurationRevision: sendSetup.configuration!.revision,
            }),
          );
          if (!active.current) return;
          if (revision === generation.current) {
            if (plan.ok) {
              setSendPlan(plan.value);
              setReview(plan.value.review);
            } else setError({ ...plan.error, target: 'review' });
          }
        }
      } else setError({ ...result.error, target: 'review' });
    }
    setReviewing(false);
  }

  async function executeBalance() {
    if (executionLock.current || fieldsDisabled || !balanceContext || balanceRequestId) return;
    const requestId = crypto.randomUUID();
    receiptRequest.current = monetary && receiptPreference === 'WITH_PRINT' ? requestId : undefined;
    executionLock.current = true;
    setExecutingBalance(true);
    setBalanceRequestId(requestId);
    setRequestOperation(monetary ? 'WITHDRAWAL' : 'BALANCE');
    setBalanceExecution(undefined);
    setBalanceReadiness(undefined);
    setSendPlan(undefined);
    setError(undefined);
    let backendResult: Result<BalanceExecution> | undefined;
    try {
      const result = await client.call(
        async (api) => {
          const request = {
            ...balanceContext,
            requestId,
          };
          backendResult = await (monetary
            ? api.executeWithdrawal(request)
            : api.executeBalance(request));
          return backendResult;
        },
        180000,
        'No se conoce el resultado. Consulta la referencia antes de realizar otro envío.',
      );
      if (!active.current) return;
      if (result.ok) {
        setBalanceExecution(result.value);
        recordExecution(result.value);
        if (balanceNotTransmitted(result.value)) setBalanceRequestId(undefined);
        if (balanceResponseConfirmed(result.value)) {
          setBalanceRequestId(undefined);
          selectedCardRef.current = undefined;
          setSelectedCard(undefined);
        }
      } else {
        setError({ ...result.error, target: 'review' });
        // Main returns failures only before execution; financial outcomes are
        // BalanceExecution records. A locally synthesized timeout/IPC rejection
        // is a different object and must retain the unresolved reference.
        if (result === backendResult) setBalanceRequestId(undefined);
      }
    } finally {
      executionLock.current = false;
      if (active.current) setExecutingBalance(false);
    }
  }
  async function recoverBalance() {
    if (!balanceRequestId || executionLock.current) return;
    executionLock.current = true;
    setRecoveringBalance(true);
    try {
      const result = await client.call((api) =>
        requestOperation === 'WITHDRAWAL'
          ? api.getWithdrawalExecution({ environment: 'QA', requestId: balanceRequestId })
          : api.getBalanceExecution({ environment: 'QA', requestId: balanceRequestId }),
      );
      if (!active.current) return;
      if (result.ok && result.value) {
        setBalanceExecution(result.value);
        recordExecution(result.value);
        setError(undefined);
        if (balanceNotTransmitted(result.value)) setBalanceRequestId(undefined);
        if (balanceResponseConfirmed(result.value)) {
          setBalanceRequestId(undefined);
          selectedCardRef.current = undefined;
          setSelectedCard(undefined);
        }
      } else
        setError({
          code: result.ok ? 'NOT_FOUND' : result.error.code,
          message: result.ok
            ? 'Aún no hay un registro recuperable. Conserva la referencia y verifica la ejecución antes de otro envío.'
            : result.error.message,
          target: 'review',
        });
    } finally {
      executionLock.current = false;
      if (active.current) setRecoveringBalance(false);
    }
  }
  async function loadBalanceHistory() {
    const result = await client.call(async (api) => {
      const [balances, withdrawals] = await Promise.all([
        api.getBalanceHistory('QA'),
        api.getWithdrawalHistory('QA'),
      ]);
      if (!balances.ok) return balances;
      if (!withdrawals.ok) return withdrawals;
      return {
        ok: true as const,
        value: [...balances.value, ...withdrawals.value].sort((a, b) =>
          b.startedAt.localeCompare(a.startedAt),
        ),
      };
    });
    if (!active.current) return;
    if (result.ok) setBalanceHistory(result.value);
    else setError({ ...result.error, target: 'review' });
  }

  function recordExecution(execution: BalanceExecution) {
    setSessionExecutions((items) =>
      [execution, ...items.filter((item) => item.requestId !== execution.requestId)].slice(0, 20),
    );
  }
  function clearCard() {
    invalidate();
    selectedCardRef.current = undefined;
    setSelectedCard(undefined);
    cardHeading.current?.focus();
  }
  const canStartNewTransaction = !!(
    balanceRequestId &&
    requestOperation === 'BALANCE' &&
    balanceExecution &&
    canStartAfterUnconfirmedBalance(balanceExecution)
  );
  function startNewTransaction() {
    if (!canStartNewTransaction || executionLock.current || fieldsDisabled) return;
    // Keep the original execution and correlation in the journal/session. Only
    // clear the active form, requiring a new card read, request ID and PIN.
    invalidate();
    setBalanceExecution(undefined);
    setBalanceRequestId(undefined);
    selectedCardRef.current = undefined;
    setSelectedCard(undefined);
    cardHeading.current?.focus();
  }
  const sendHint = balanceRequestId
    ? canStartNewTransaction
      ? 'Selecciona Nueva transacción para continuar. La consulta anterior queda en el historial sin respuesta confirmada.'
      : 'Consulta el resultado del intento anterior antes de volver a enviar.'
    : loading || sendSetupLoading
      ? 'Cargando configuración…'
      : !selectedAtm
        ? 'Selecciona un perfil ATM.'
        : snapshot?.environment !== 'QA' ||
            (!monetary && transaction !== 'BALANCE') ||
            account !== 'SAVINGS' ||
            scenario !== 'LOCAL'
          ? 'Ejecución disponible para saldo o retiro · Ahorros · ATM Local · QA.'
          : monetary && !isWithdrawalAmount(amount)
            ? 'Escribe un monto positivo con punto y dos decimales (máximo 10 dígitos enteros).'
            : !selectedCard
              ? balanceExecution && balanceResponseConfirmed(balanceExecution)
                ? 'Operación finalizada. Lee la tarjeta para iniciar una nueva transacción.'
                : 'Lee la tarjeta para preparar el envío.'
              : !sendSetup?.configuration
                ? 'Configura el destino de envío en Configuración.'
                : monetary && balanceReadiness && !balanceReadiness.ready
                  ? balanceReadiness.blockers[0]?.label
                  : 'El PIN se solicitará en una ventana protegida al enviar.';

  return (
    <div className="transaction-workspace">
      <div className="transaction-heading">
        <div>
          <h1>Nueva transacción</h1>
          <p>
            {monetary
              ? 'Prepara el retiro, revisa los importes y elige tu comprobante.'
              : 'Configura la operación y consulta la respuesta del host.'}
          </p>
        </div>
        <div className="transaction-toolbar">
          <CaseLibrary
            draft={draft}
            catalog={catalog}
            client={client}
            disabled={fieldsDisabled || loading || !!catalogError}
            canSave={!!selectedAtm && !!parseDraftRequest(draft)}
            onCatalogChange={onCatalogChange}
            onLoad={loadCase}
            onOpenChange={onCasesOpenChange}
          />
        </div>
      </div>
      {caseWarning && (
        <div className="document-note" role="status">
          {caseWarning}
        </div>
      )}
      <div className="transaction-columns direct-transaction-columns">
        <section
          className="panel transaction-context transaction-composer"
          aria-labelledby="transaction-context-title"
        >
          <div className="panel-heading">
            <h2 id="transaction-context-title" ref={dataHeading} tabIndex={-1}>
              Datos de la transacción
            </h2>
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
          </div>
          <div className="transaction-fields">
            <div className="transaction-context-selectors">
              <label>
                Perfil ATM
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
              </label>
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
            </div>
            {!atms.length && !loading && (
              <div className="empty-profile-action">
                <button
                  className="text-button"
                  disabled={fieldsDisabled || !catalog || !!catalogError}
                  onClick={() =>
                    onNavigate(
                      catalog?.entities.some((entity) => entity.active) ? 'atms' : 'entities',
                    )
                  }
                >
                  {catalog?.entities.some((entity) => entity.active)
                    ? 'Crear ATM'
                    : 'Crear entidad'}
                </button>
              </div>
            )}
            {catalogError && (
              <div className="inline-error" role="alert">
                <strong>{catalogError.message}</strong>
                <small>{catalogError.code}</small>
              </div>
            )}
            <label>
              Operación
              <select
                aria-label="Transacción"
                value={transaction}
                disabled={fieldsDisabled}
                onChange={(event) => {
                  const selected = transactions.find((item) => item.id === event.target.value);
                  if (selected) {
                    invalidate();
                    setTransaction(selected.id);
                    setAmount('');
                  }
                }}
              >
                {transactions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="account-options" disabled={fieldsDisabled || original}>
              <legend>Cuenta</legend>
              <div className="account-segments">
                {accountTypes.map((item) => (
                  <label key={item.id}>
                    <input
                      type="radio"
                      name="transaction-account"
                      value={item.id}
                      checked={!original && account === item.id}
                      onChange={() => {
                        invalidate();
                        setAccount(item.id);
                      }}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
              {original && (
                <small className="field-feedback">Pendiente de transacción original</small>
              )}
            </fieldset>
            {monetary && (
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
                    : 'El perfil QA valida los montos permitidos.'}
                </small>
              </label>
            )}
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
          </div>

          {error?.target !== 'review' && errorFeedback}
          <section className="transaction-card-section" aria-labelledby="transaction-card-title">
            <div className="panel-heading">
              <h2 id="transaction-card-title" ref={cardHeading} tabIndex={-1}>
                Tarjeta
              </h2>
              <span className="form-note">Lectura por contacto</span>
            </div>
            {visible && (
              <CardReaderView
                transaction
                disabled={fieldsDisabled}
                selectedReadId={selectedCard?.readId}
                onUseCard={chooseCard}
                onClearCard={clearCard}
                onAvailableCardChange={onCardAvailable}
                onReadingChange={onCardReading}
              />
            )}
          </section>
          <details className="composer-options" aria-label="Opciones y detalles técnicos">
            <summary>Opciones y detalles técnicos</summary>
            <div className="composer-options-content">
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
              <p className="form-note">
                Revisión documental opcional. No es un requisito para enviar.
              </p>
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
                      : (accountTypes.find((item) => item.id === account)?.label ??
                        'Sin verificar'),
                  ],
                  ...(monetary ? [['Monto de prueba', amount || 'Escribe el monto']] : []),
                  [
                    'Tarjeta',
                    selectedCard?.panMasked ??
                      (selectedCard
                        ? 'Número no disponible en el chip'
                        : 'Pendiente de seleccionar'),
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
          <div className="composer-footer">
            <button
              className="text-button"
              aria-label="Limpiar borrador"
              disabled={fieldsDisabled}
              onClick={requestReset}
            >
              <Icon name="trash" size={16} />
              Limpiar
            </button>
            <div className="transaction-send-actions">
              <span className="composer-summary">
                {transactions.find((item) => item.id === transaction)?.label} ·{' '}
                {original
                  ? 'Original pendiente'
                  : accountTypes.find((item) => item.id === account)?.label}
              </span>
              <button
                className="primary"
                disabled={fieldsDisabled || !balanceContext || !!balanceRequestId}
                onClick={() => void executeBalance()}
                aria-describedby="send-blocked-note"
              >
                {executingBalance
                  ? requestOperation === 'WITHDRAWAL'
                    ? 'Procesando retiro…'
                    : 'Consultando saldo…'
                  : 'Enviar transacción'}{' '}
                <Icon name="arrow" size={17} />
              </button>
            </div>
          </div>
          <p id="send-blocked-note" className="send-status-note" aria-live="polite">
            {sendHint}
          </p>
        </section>
        <section className="panel transaction-result-panel" aria-label="Resultado">
          <div className="panel-heading">
            <h2 ref={reviewHeading} tabIndex={-1}>
              Resultado
            </h2>
            <span
              className={`pill ${balanceExecution?.outcome === 'APPROVED' ? 'result-success-pill' : 'neutral'}`}
            >
              {executingBalance
                ? 'En curso'
                : balanceExecution
                  ? balanceExecution.outcome === 'APPROVED'
                    ? 'Aprobado'
                    : 'Intento registrado'
                  : balanceRequestId
                    ? 'Por confirmar'
                    : 'Sin ejecutar'}
            </span>
          </div>
          {error?.target === 'review' && errorFeedback}
          {balanceExecution ? (
            <BalanceExecutionView
              execution={balanceExecution}
              onReceipt={(execution) => {
                const preview = createWithdrawalReceipt(execution);
                if (preview) setReceipt(preview);
              }}
            />
          ) : (
            <>
              <div className="result-empty" role="status">
                <Icon name={executingBalance || balanceRequestId ? 'clock' : 'file'} size={48} />
                <h3>
                  {executingBalance
                    ? 'Esperando respuesta'
                    : balanceRequestId
                      ? 'Resultado por confirmar'
                      : 'Aún no hay resultado'}
                </h3>
                <p>
                  {executingBalance
                    ? 'La transacción está en curso. Conserva esta ventana abierta.'
                    : balanceRequestId
                      ? 'Recupera el resultado del intento antes de volver a enviar.'
                      : 'La respuesta aparecerá aquí después del envío.'}
                </p>
              </div>
              <dl className="result-metadata">
                {['Respuesta', 'Tiempo', 'STAN', 'RRN'].map((label) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>—</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {balanceRequestId && !executingBalance && (
            <button
              className="secondary recover-result"
              disabled={recoveringBalance}
              onClick={() => void recoverBalance()}
            >
              Consultar resultado de {requestOperation === 'WITHDRAWAL' ? 'retiro' : 'saldo'}
            </button>
          )}
          {canStartNewTransaction && !executingBalance && (
            <div className="recover-result">
              <p>
                La consulta anterior permanece sin respuesta confirmada en el historial. Puedes
                iniciar otra operación con una nueva lectura de tarjeta y PIN.
              </p>
              <button
                className="primary"
                disabled={fieldsDisabled || recoveringBalance}
                onClick={startNewTransaction}
              >
                Nueva transacción
              </button>
            </div>
          )}
          {balanceRequestId && (
            <details className="inline-details result-reference">
              <summary>Ver detalle técnico</summary>
              <p className="technical-reference">Referencia de solicitud {balanceRequestId}</p>
            </details>
          )}
        </section>
      </div>
      <section className="panel session-activity" aria-label="Actividad de esta sesión">
        <div className="panel-heading">
          <h2>Actividad de esta sesión</h2>
          <button className="text-button" onClick={() => onNavigate('history')}>
            Ver historial <Icon name="arrow" size={14} />
          </button>
        </div>
        <div className="activity-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Operación</th>
                <th>ATM</th>
                <th>Estado</th>
                <th>Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {sessionExecutions.length ? (
                sessionExecutions.map((item) => (
                  <tr key={item.requestId}>
                    <td>{new Date(item.startedAt).toLocaleTimeString('es-EC')}</td>
                    <td>
                      {item.withdrawal
                        ? `Retiro · USD ${item.withdrawal.amount}`
                        : 'Consulta de saldo'}
                    </td>
                    <td>
                      {item.correlation?.terminalId ??
                        catalog?.atms.find((atm) => atm.id === item.atmId)?.alias ??
                        'ATM no disponible'}
                    </td>
                    <td>
                      <span>{executionOutcomeLabel(item)}</span>
                    </td>
                    <td>{item.elapsedMs} ms</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="session-empty">
                    <Icon name="clock" size={19} /> No se han enviado transacciones en esta sesión.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {snapshot?.environment === 'QA' && (
        <details className="section-details balance-history-details">
          <summary>Historial de transacciones QA</summary>
          <button
            className="text-button"
            disabled={fieldsDisabled}
            onClick={() => void loadBalanceHistory()}
          >
            Actualizar historial
          </button>
          {balanceHistory &&
            (balanceHistory.length ? (
              balanceHistory.map((execution) => (
                <BalanceExecutionView
                  key={execution.requestId}
                  execution={execution}
                  onReceipt={(item) => {
                    const preview = createWithdrawalReceipt(item);
                    if (preview) setReceipt(preview);
                  }}
                />
              ))
            ) : (
              <p>No hay transacciones ejecutadas registradas.</p>
            ))}
        </details>
      )}
      {receipt && (
        <WithdrawalReceiptDialog
          key={receipt.requestId}
          receipt={receipt}
          client={client}
          onClose={() => setReceipt(undefined)}
        />
      )}
      <details className="section-details transaction-execution-details">
        <summary>
          Flujo e inspector <span>Vista documental</span>
        </summary>
        <div className="execution-details-grid">
          <section className="panel transaction-flow" aria-labelledby="transaction-flow-title">
            <div className="panel-heading">
              <h2 id="transaction-flow-title">Flujo de transacción</h2>
              <span className="pill neutral">Sin ejecución</span>
            </div>
            <ol className="transaction-route">
              {[
                {
                  icon: 'atm' as const,
                  title: 'ATM Simulator',
                  text: selectedAtm ? 'Perfil en borrador, sin envío' : 'Selecciona un perfil ATM',
                },
                {
                  icon: 'monitor' as const,
                  title: 'Switch Coonecta (SmartVista)',
                  text: 'Conexión sin configurar',
                },
                { icon: 'database' as const, title: 'Core', text: 'Observador sin configurar' },
                {
                  icon: 'transaction' as const,
                  title: 'Respuesta del Switch',
                  text: 'Sin mensaje recibido',
                },
              ].map((step) => (
                <li key={step.title}>
                  <span className="route-icon">
                    <Icon name={step.icon} size={21} />
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.text}</small>
                  </div>
                  <span className="route-time">—</span>
                </li>
              ))}
            </ol>
            <div className="transaction-result-placeholder">
              <Icon name="clock" size={23} />
              <div>
                <strong>Resultado pendiente</strong>
              </div>
            </div>
            <dl className="transaction-result-values">
              <div>
                <dt>Código de respuesta</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Monto ejecutado</dt>
                <dd>—</dd>
              </div>
            </dl>
          </section>
          <section
            className="panel transaction-inspector"
            aria-labelledby="transaction-inspector-title"
          >
            <div className="panel-heading">
              <h2 id="transaction-inspector-title">Mensaje ISO8583</h2>
              <label className="inspector-view-picker">
                <span className="visually-hidden">Vista del mensaje</span>
                <select aria-label="Vista del mensaje" disabled>
                  <option>Vista: Campos</option>
                </select>
              </label>
            </div>
            <div className="inspector-tabs" role="tablist" aria-label="Vistas de evidencia">
              <button role="tab" aria-selected="false" disabled>
                Solicitud
              </button>
              <button role="tab" aria-selected="false" disabled>
                Respuesta
              </button>
              <button role="tab" aria-selected="false" disabled>
                RAW
              </button>
              <button role="tab" aria-selected="false" disabled>
                HEX
              </button>
            </div>
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
                  <td colSpan={3}>
                    <div className="empty-state compact">
                      <Icon name="transaction" size={32} />
                      <h3>Esperando una ejecución</h3>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="inspector-footnote">
              <Icon name="shield" size={14} /> Sin mensaje · datos sensibles protegidos
            </p>
          </section>{' '}
        </div>
      </details>
      <details className="section-details transaction-documentation-details">
        <summary>Documentación y capturas</summary>
        <div className="transaction-support-grid">
          <section
            className="panel transaction-reference-panel"
            aria-label="Documentación de la operación"
          >
            {' '}
            <div className="documented-operation" aria-label="Referencia documental">
              <span className="eyebrow">REFERENCIA DOCUMENTAL</span>
              <h3>{original ? 'Reverso asociado al original' : 'Catálogo de la operación'}</h3>
              {operation ? (
                <>
                  <dl>
                    <div>
                      <dt>TrnCode CMS</dt>
                      <dd className="documented-code">{operation.code}</dd>
                    </div>
                    <div>
                      <dt>Tipo de cuenta CMS</dt>
                      <dd>
                        {operation.accountCode} ·{' '}
                        {accountTypes.find((item) => item.id === operation.account)?.label}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    {operation.source.title} v{operation.source.version} · p.{' '}
                    {operation.source.page}; cuenta p. 17.
                  </p>
                  <small>
                    Referencia CMS. El formato del mensaje ATM sigue pendiente de validación.
                  </small>
                </>
              ) : (
                <p>
                  {original
                    ? 'Requiere el mensaje original, la familia MTI y los campos de correlación aprobados.'
                    : 'El catálogo documental no está disponible para esta selección.'}
                </p>
              )}
            </div>
            {original && (
              <div className="document-note">
                <Icon name="shield" size={19} />
                <p>
                  {transaction === 'TIMEOUT_REVERSAL'
                    ? 'Timeout, duplicados y respuesta tardía: reglas operativas pendientes.'
                    : 'El código y la cuenta se resolverán desde la transacción original validada.'}
                </p>
              </div>
            )}
          </section>
          {snapshot?.captureEvidence && (
            <section className="panel transaction-captures-panel">
              <CaptureEvidenceView report={snapshot.captureEvidence} />
            </section>
          )}
        </div>
      </details>
      <dialog
        ref={discardDialog}
        className="catalog-dialog discard-draft-dialog"
        aria-labelledby="discard-draft-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDiscard();
        }}
      >
        <h2 id="discard-draft-title">¿Limpiar este borrador?</h2>
        <p>Se quitarán los datos y la tarjeta de esta sesión. Los casos guardados se conservan.</p>
        <div className="catalog-actions">
          <button autoFocus onClick={closeDiscard}>
            Conservar borrador
          </button>
          <button
            className="danger"
            onClick={() => {
              closeDiscard();
              reset();
            }}
          >
            Confirmar limpieza
          </button>
        </div>
      </dialog>
    </div>
  );
}
