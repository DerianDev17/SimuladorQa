import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BalanceExecution,
  BalanceReadiness,
} from '../../../../packages/domain/src/balance-inquiry';
import {
  balanceDeliveryUncertain,
  balanceNotTransmitted,
  balanceResponseConfirmed,
  canStartAfterUnconfirmedBalance,
  canStartAfterUnconfirmedWithdrawal,
  canStartBalanceAfterUnconfirmedWithdrawal,
  parseBalanceContextRequest,
  withdrawalBlocksNewExecution,
} from '../../../../packages/domain/src/balance-inquiry';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import { selectableAtms } from '../../../../packages/domain/src/catalogs';
import type { Scenario, TransactionType } from '../../../../packages/domain/src/index';
import type { SavedCase } from '../../../../packages/domain/src/saved-cases';
import { caseMatchesDraft } from '../../../../packages/domain/src/saved-cases';
import type { SendConfigurationSnapshot } from '../../../../packages/domain/src/send-configuration';
import type { AccountType, DraftRequest } from '../../../../packages/domain/src/transaction-draft';
import {
  draftBlockers,
  isDraftAmount,
  needsAmount,
  needsOriginal,
} from '../../../../packages/domain/src/transaction-draft';
import {
  isWithdrawalAmount,
  parseWithdrawalContextRequest,
} from '../../../../packages/domain/src/withdrawal';
import {
  createWithdrawalReceipt,
  type ReceiptPreference,
  type WithdrawalReceipt,
} from '../../../../packages/domain/src/withdrawal-receipt';
import type {
  AppSnapshot,
  ErrorCode,
  PreparedSendPlan,
  Result,
  ReviewedDraft,
} from '../../../../packages/shared/src/contracts';
import type { DesktopClient } from './desktop-client';
import { localDraftChecks } from './draft-feedback';
import type { TransactionCard } from './transaction-card';
import type { AtmSelection } from './transaction-setup';
import { resolveAtmSelection } from './transaction-setup';
export interface TransactionPreparationProps {
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
export function useTransactionPreparation({
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
}: TransactionPreparationProps) {
  const [transaction, setTransaction] = useState<TransactionType>('BALANCE');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('LOCAL');
  const [account, setAccount] = useState<AccountType>('SAVINGS');
  const [amount, setAmount] = useState('');
  const [withReversal, setWithReversal] = useState(false);
  const [reversalDelay, setReversalDelay] = useState(5);
  const [receiptPreference, setReceiptPreference] = useState<ReceiptPreference>('WITHOUT_PRINT');
  const [receipt, setReceipt] = useState<WithdrawalReceipt>();
  const receiptRequest = useRef<string | undefined>(undefined);
  const [atmId, setAtmId] = useState('');
  const [review, setReview] = useState<ReviewedDraft>();
  const [balanceReadiness, setBalanceReadiness] = useState<BalanceReadiness>();
  const [balanceExecution, setBalanceExecution] = useState<BalanceExecution>();
  const [inspectionGeneration, setInspectionGeneration] = useState(0);
  const [selectedCase, setSelectedCase] = useState<SavedCase>();
  const [caseRun, setCaseRun] = useState<{ saved: SavedCase; requestId: string }>();
  const [executingBalance, setExecutingBalance] = useState(false);
  const [recoveringBalance, setRecoveringBalance] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [balanceRequestId, setBalanceRequestId] = useState<string>();
  const [requestOperation, setRequestOperation] = useState<'BALANCE' | 'WITHDRAWAL'>('BALANCE');
  const [sessionExecutions, setSessionExecutions] = useState<readonly BalanceExecution[]>([]);
  const executionLock = useRef(false);
  useEffect(() => {
    if (!executingBalance || !balanceRequestId || requestOperation !== 'WITHDRAWAL') return;
    let cancelled = false;
    let polling = false;
    const timer = setInterval(() => {
      if (polling) return;
      polling = true;
      void client
        .call((api) =>
          api.getWithdrawalExecution({ environment: 'QA', requestId: balanceRequestId }),
        )
        .then((result) => {
          if (!cancelled && executionLock.current && result.ok && result.value)
            setBalanceExecution((previous) =>
              previous?.requestId === result.value!.requestId && previous.finishedAt
                ? previous
                : result.value!,
            );
        })
        .finally(() => {
          polling = false;
        });
    }, 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [executingBalance, balanceRequestId, requestOperation, client]);
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
      setSelectedCase(undefined);
      setCaseRun(undefined);
      setBalanceRequestId(undefined);
      setSessionExecutions([]);
      setReceiptPreference('WITHOUT_PRINT');
      setWithReversal(false);
      setReversalDelay(5);
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
        // Completed errors belong to history, not to a newly opened form.
        const previous = result.value.find(withdrawalBlocksNewExecution);
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
  const onCardAvailable = useCallback((card: TransactionCard | undefined) => {
    const selected = selectedCardRef.current;
    if (
      !selected ||
      (selected.readId === card?.readId &&
        selected.readerName === card.readerName &&
        selected.panMasked === card.panMasked &&
        selected.applicationLabel === card.applicationLabel &&
        selected.applicationId === card.applicationId)
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
    heading?.focus({ preventScroll: true });
    (index === 2 ? heading?.closest('.transaction-columns') : heading)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }
  function chooseCard(card: TransactionCard) {
    invalidate();
    selectedCardRef.current = card;
    setSelectedCard(card);
  }
  const applySavedCardAccount = useCallback(
    (preferred: AccountType | null) => {
      if (!preferred || preferred === account) return;
      invalidate();
      setAccount(preferred);
    },
    [account],
  );
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
    setSelectedCase(undefined);
    setCaseWarning(undefined);
    selectedCardRef.current = undefined;
    setSelectedCard(undefined);
    focusStep(0);
    setTransaction('BALANCE');
    setScenario('LOCAL');
    setAccount('SAVINGS');
    setAmount('');
    setReceiptPreference('WITHOUT_PRINT');
    setWithReversal(false);
    setReversalDelay(5);
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
  function loadCase(saved: DraftRequest, warning: string | undefined, testCase: SavedCase) {
    invalidate();
    setSelectedCase(warning ? undefined : testCase);
    selectedCardRef.current = undefined;
    setSelectedCard(undefined);
    setTransaction(saved.transaction);
    setScenario(saved.scenario);
    setAccount(saved.account ?? 'SAVINGS');
    setAmount(saved.amount ?? '');
    setReceiptPreference('WITHOUT_PRINT');
    setWithReversal(false);
    setReversalDelay(5);
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
    setInspectionGeneration((value) => value + 1);
    const requestId = crypto.randomUUID();
    const currentCase = selectedCase && catalog?.cases.find((item) => item.id === selectedCase.id);
    setCaseRun(
      currentCase &&
        currentCase.revision === selectedCase?.revision &&
        draft &&
        caseMatchesDraft(currentCase, draft)
        ? { saved: currentCase, requestId }
        : undefined,
    );
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
            ...(monetary && transaction === 'WITHDRAWAL_APPROVED' && withReversal
              ? { reversalDelaySeconds: reversalDelay }
              : {}),
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
  const canStartNewBalance = !!(
    balanceRequestId &&
    requestOperation === 'WITHDRAWAL' &&
    transaction === 'BALANCE' &&
    balanceExecution &&
    canStartBalanceAfterUnconfirmedWithdrawal(balanceExecution)
  );
  const canStartNewTransaction = !!(
    balanceRequestId &&
    balanceExecution &&
    ((requestOperation === 'BALANCE' && canStartAfterUnconfirmedBalance(balanceExecution)) ||
      (requestOperation === 'WITHDRAWAL' && canStartAfterUnconfirmedWithdrawal(balanceExecution)) ||
      canStartNewBalance)
  );
  function startNewTransaction() {
    if (!canStartNewTransaction || executionLock.current || fieldsDisabled) return;
    setInspectionGeneration((value) => value + 1);
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
      ? canStartNewBalance
        ? 'Selecciona Nueva consulta de saldo para continuar. El retiro anterior conserva su referencia en el historial.'
        : 'Selecciona Nueva transacción para continuar. El intento anterior conserva su resultado en el historial.'
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
  return {
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
    operation,
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
    draft,
    client,
    onCatalogChange,
    loadCase,
    onCasesOpenChange,
    caseWarning,
    selectedCase,
    balanceExecution,
    inspectionGeneration,
    reviewHeading,
    canStartNewTransaction,
    canStartNewBalance,
    recoveringBalance,
    startNewTransaction,
    setReceipt,
    caseRun,
    recoverBalance,
    sessionExecutions,
    atmId,
    receipt,
    discardDialog,
    closeDiscard,
    reset,
  };
}
export type TransactionPreparation = ReturnType<typeof useTransactionPreparation>;
