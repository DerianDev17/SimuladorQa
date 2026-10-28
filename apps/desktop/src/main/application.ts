import {
  dataBlockers,
  isRecord,
  parseEnvironmentRequest,
  parsePreparationRequest,
  prepareTransaction,
} from '../../../../packages/domain/src/index';
import { failure } from '../../../../packages/shared/src/contracts';
import type { AppSnapshot, Result, ReviewedDraft } from '../../../../packages/shared/src/contracts';
import type { Preparation } from '../../../../packages/domain/src/index';
import type { Preferences, PreferencesStore, RuntimeIdentity } from './ports';
import {
  parseSaveAtmRequest,
  parseSaveEntityRequest,
  parseDeleteRequest,
} from '../../../../packages/domain/src/catalogs';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import type { CatalogCommand } from '../../../../packages/shared/src/catalog-worker';
import type { CatalogStore } from './catalog-port';
import { parseDraftRequest, reviewDraft } from '../../../../packages/domain/src/transaction-draft';
import type { OperationCatalog } from '../../../../packages/domain/src/transaction-draft';
import type { DestinationInspector } from '../../../../packages/domain/src/destination-compatibility';
import type { CaptureEvidenceCatalog } from '../../../../packages/domain/src/capture-evidence';
import { parseSaveCaseRequest } from '../../../../packages/domain/src/saved-cases';
import { parseObservationRequest } from '../../../../packages/domain/src/observations';
import { parseMediatorLiveRequest } from '../../../../packages/domain/src/mediator-live';
import type { MediatorLiveSnapshot } from '../../../../packages/domain/src/mediator-live';
import type { ObservationSearch } from '../../../../packages/domain/src/observations';
import type { TransactionObserver } from './observation-port';
import type { NetworkEvidenceCatalog } from '../../../../packages/domain/src/network-evidence';
import type { CardReaderAdapter } from '../../../../packages/domain/src/card-reader';

// Las operaciones locales comparten cola. El observador verifica el ambiente antes
// y después de consultar, sin retener esa cola durante la espera de red.
import { isRevision, isUuid, selectableAtms } from '../../../../packages/domain/src/catalogs';
import { parseSaveSendConfiguration } from '../../../../packages/domain/src/send-configuration';
import type { SendConfigurationSnapshot } from '../../../../packages/domain/src/send-configuration';
import type { PreparedSendPlan } from '../../../../packages/shared/src/contracts';
import type { SendConfigurationService } from './send-configuration-service';
import {
  parseBalanceContextRequest,
  parseBalanceExecutionRequest,
} from '../../../../packages/domain/src/balance-inquiry';
import type {
  BalanceContextRequest,
  BalanceReadiness,
  BalanceExecution,
} from '../../../../packages/domain/src/balance-inquiry';
import type { BalanceTarget } from './balance-ports';
import { missingBalanceContext, loadExecutionScope } from './balance-inquiry-service';
import type { BalanceInquiryService } from './balance-inquiry-service';
import type { SwitchConnectionPort } from './switch-connection-port';
import type { SwitchConnectionSnapshot } from '../../../../packages/domain/src/switch-connection';
import {
  parseWithdrawalContextRequest,
  parseWithdrawalExecutionRequest,
  missingWithdrawalContext,
} from '../../../../packages/domain/src/withdrawal';
import type { WithdrawalService } from './withdrawal-service';

export class DesktopApplication {
  private queue: Promise<unknown> = Promise.resolve();
  private environmentRevision = 0;
  private observationBusy = false;
  private balanceBusy: string | undefined;
  private balanceCount = 0;
  private balanceScope: string | undefined;
  private financialIdle: Promise<void> = Promise.resolve();
  private resolveFinancialIdle: (() => void) | undefined;
  isFinancialBusy(): boolean {
    return this.balanceBusy !== undefined;
  }
  whenFinancialIdle(): Promise<void> {
    return this.financialIdle;
  }
  constructor(
    private readonly store: PreferencesStore,
    private readonly identity: RuntimeIdentity,
    private readonly catalogs?: CatalogStore,
    private readonly operations?: OperationCatalog,
    private readonly destinationInspector?: DestinationInspector,
    private readonly captureEvidence?: CaptureEvidenceCatalog,
    private readonly observer?: TransactionObserver,
    private readonly networkEvidence?: NetworkEvidenceCatalog,
    private readonly readerAdapter?: CardReaderAdapter,
    private readonly sendConfiguration?: SendConfigurationService,
    private readonly balanceInquiry?: BalanceInquiryService,
    private readonly switchConnection?: SwitchConnectionPort,
    private readonly withdrawalService?: WithdrawalService,
  ) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private snapshot(preferences: Preferences): AppSnapshot {
    return {
      version: this.identity.version,
      agentId: this.identity.agentId,
      hostname: this.identity.hostname,
      environment: preferences.environment,
      storage: 'AVAILABLE',
      reader: this.readerAdapter ? 'CONFIGURED' : 'NOT_CONFIGURED',
      connection:
        preferences.environment === 'QA' && this.switchConnection
          ? this.switchConnection.snapshot().state
          : 'NOT_CONFIGURED',
      controlPlane: 'NOT_CONFIGURED',
      blockers: dataBlockers,
      audit: [...preferences.audit].reverse(),
      documentedOperations: this.operations?.entries ?? [],
      captureEvidence: this.captureEvidence?.report ?? null,
      networkEvidence: this.networkEvidence?.forEnvironment(preferences.environment) ?? {
        status: 'NOT_CONFIGURED',
      },
    };
  }

  getSnapshot(): Promise<Result<AppSnapshot>> {
    return this.serialize(async () => {
      try {
        return { ok: true, value: this.snapshot(await this.store.read()) };
      } catch {
        return failure(
          'STORAGE_UNAVAILABLE',
          'No se pudo leer la configuración local. Revisa sus permisos o integridad.',
        );
      }
    });
  }

  setEnvironment(payload: unknown): Promise<Result<AppSnapshot>> {
    return this.serialize(async () => {
      if (this.balanceBusy)
        return failure(
          'CONFLICT',
          'Espera el resultado de la transacción antes de cambiar el ambiente.',
        );
      const environment = parseEnvironmentRequest(payload);
      if (!environment)
        return failure('VALIDATION_ERROR', 'Selecciona QA o PREPROD. Producción está bloqueada.');
      try {
        const current = await this.store.read();
        if (environment === current.environment) return { ok: true, value: this.snapshot(current) };
        const next: Preferences = {
          version: 1,
          environment,
          audit: [
            ...current.audit,
            {
              id: this.identity.uuid(),
              timestamp: this.identity.now(),
              environment,
              previousEnvironment: current.environment,
              user: this.identity.user,
              machine: this.identity.hostname,
            },
          ].slice(-100),
        };
        await this.store.write(next);
        this.switchConnection?.disconnect('ENVIRONMENT_CHANGED');
        this.environmentRevision++;
        return { ok: true, value: this.snapshot(next) };
      } catch {
        return failure(
          'STORAGE_UNAVAILABLE',
          'No se pudo guardar el ambiente. La selección anterior se conserva.',
        );
      }
    });
  }

  prepare(payload: unknown): Promise<Result<Preparation>> {
    return this.serialize(async () => {
      const request = parsePreparationRequest(payload);
      if (!request)
        return failure('VALIDATION_ERROR', 'Selecciona una transacción y un escenario válidos.');
      try {
        const preferences = await this.store.read();
        return { ok: true, value: prepareTransaction(preferences.environment, request) };
      } catch {
        return failure('STORAGE_UNAVAILABLE', 'No se pudo verificar la configuración local.');
      }
    });
  }

  async searchObservations(payload: unknown): Promise<Result<ObservationSearch>> {
    const request = parseObservationRequest(payload);
    if (!request)
      return failure(
        'VALIDATION_ERROR',
        'Revisa los filtros: intervalo de hasta 24 horas, fechas SQL y máximo 100 resultados.',
      );
    if (request.environment !== 'PREPROD')
      return failure('FORBIDDEN', 'La consulta de Mediator está disponible únicamente en PREPROD.');
    if (this.observationBusy)
      return failure('CONFLICT', 'Ya hay una consulta de Mediator en curso.');
    this.observationBusy = true;
    try {
      const initial = await this.serialize(async () => ({
        preferences: await this.store.read(),
        revision: this.environmentRevision,
      }));
      if (initial.preferences.environment !== request.environment)
        return failure('CONFLICT', 'El ambiente cambió. Repite la consulta en PREPROD.');
      if (!this.observer)
        return failure('SERVICE_UNAVAILABLE', 'El observador de Mediator no está configurado.');
      const result = await this.observer.search(request);
      const current = await this.serialize(async () => ({
        preferences: await this.store.read(),
        revision: this.environmentRevision,
      }));
      if (
        current.revision !== initial.revision ||
        current.preferences.environment !== request.environment
      )
        return failure(
          'CONFLICT',
          'El ambiente cambió durante la consulta. Los resultados se descartaron.',
        );
      return result.ok
        ? {
            ok: true,
            value: {
              ...result.value,
              queryId: this.identity.uuid(),
              queriedAt: this.identity.now(),
            },
          }
        : result;
    } catch {
      return failure('SERVICE_UNAVAILABLE', 'No se pudo completar la consulta de Mediator.');
    } finally {
      this.observationBusy = false;
    }
  }

  async getMediatorLive(payload: unknown): Promise<Result<MediatorLiveSnapshot>> {
    const request = parseMediatorLiveRequest(payload);
    if (!request) return failure('VALIDATION_ERROR', 'Consulta en vivo de Mediator inválida.');
    if (this.observationBusy)
      return failure('CONFLICT', 'Ya hay una consulta de Mediator en curso.');
    this.observationBusy = true;
    try {
      const initial = await this.serialize(async () => ({
        preferences: await this.store.read(),
        revision: this.environmentRevision,
      }));
      if (initial.preferences.environment !== request.environment)
        return failure('CONFLICT', 'El ambiente cambió. Repite la consulta.');
      if (!this.observer?.live)
        return failure('SERVICE_UNAVAILABLE', 'El observador de Mediator no está configurado.');
      const result = await this.observer.live(request);
      const current = await this.serialize(async () => ({
        preferences: await this.store.read(),
        revision: this.environmentRevision,
      }));
      if (
        current.revision !== initial.revision ||
        current.preferences.environment !== request.environment
      )
        return failure('CONFLICT', 'El ambiente cambió durante la consulta.');
      return result.ok
        ? { ok: true, value: { ...result.value, queriedAt: this.identity.now() } }
        : result;
    } catch {
      return failure(
        'SERVICE_UNAVAILABLE',
        'No se pudo completar la consulta en vivo de Mediator.',
      );
    } finally {
      this.observationBusy = false;
    }
  }

  reviewDraft(payload: unknown): Promise<Result<ReviewedDraft>> {
    return this.serialize(async () => {
      const request = parseDraftRequest(payload);
      if (!request)
        return failure(
          'VALIDATION_ERROR',
          'Revisa la operación, cuenta, ATM y monto con punto y dos decimales.',
        );
      try {
        const current = await this.store.read();
        if (request.environment !== current.environment)
          return failure('CONFLICT', 'El ambiente cambió. Recarga el contexto de la transacción.');
        if (!this.catalogs || !this.operations)
          return failure('SERVICE_UNAVAILABLE', 'El servicio de preparación no está disponible.');
        const catalog = await this.catalogs.execute(
          { kind: 'list', environment: request.environment },
          {
            user: this.identity.user,
            machine: this.identity.hostname,
            timestamp: this.identity.now(),
          },
        );
        if (!catalog.ok) return catalog;
        const review = reviewDraft(
          request,
          catalog.value,
          this.operations,
          this.destinationInspector,
        );
        return review
          ? {
              ok: true,
              value: { ...review, reviewId: this.identity.uuid(), reviewedAt: this.identity.now() },
            }
          : failure(
              'CONFLICT',
              'El ATM cambió o su entidad ya no está disponible. Recarga los perfiles.',
            );
      } catch {
        return failure(
          'STORAGE_UNAVAILABLE',
          'No se pudo verificar la configuración o los perfiles locales.',
        );
      }
    });
  }

  getSendConfiguration(payload: unknown): Promise<Result<SendConfigurationSnapshot>> {
    return this.serialize(async () => {
      const environment = parseEnvironmentRequest(payload);
      if (!environment) return failure('VALIDATION_ERROR', 'Selecciona QA o PREPROD.');
      try {
        const preferences = await this.store.read();
        if (preferences.environment !== environment)
          return failure('CONFLICT', 'El ambiente cambió. Recarga la configuración.');
        return this.sendConfiguration
          ? await this.sendConfiguration.read(environment)
          : failure('SERVICE_UNAVAILABLE', 'La configuración de envío no está disponible.');
      } catch {
        return failure('STORAGE_UNAVAILABLE', 'No se pudo verificar el ambiente.');
      }
    });
  }
  switchConnectionAction(
    action: 'status' | 'connect' | 'disconnect',
    payload: unknown,
  ): Promise<Result<SwitchConnectionSnapshot>> {
    return this.serialize(async () => {
      if (parseEnvironmentRequest(payload) !== 'QA')
        return failure('FORBIDDEN', 'La conexión al Switch está disponible en QA.');
      if (action !== 'status' && this.balanceBusy)
        return failure(
          'CONFLICT',
          'Espera el resultado de la transacción antes de cambiar la conexión.',
        );
      try {
        if ((await this.store.read()).environment !== 'QA')
          return failure('CONFLICT', 'El ambiente cambió. Abre la conexión desde QA.');
        if (!this.switchConnection)
          return failure('SERVICE_UNAVAILABLE', 'El servicio de conexión no está disponible.');
        if (action === 'connect') {
          const setup = await this.sendConfiguration?.read('QA');
          if (!setup)
            return failure('SERVICE_UNAVAILABLE', 'La configuración de envío no está disponible.');
          if (!setup.ok) return setup;
          const configuration = setup.value.configuration;
          if (!configuration)
            return failure(
              'CONFLICT',
              'No hay una configuración de conexión guardada. Abre Configuración para definirla.',
            );
          if (!setup.value.documentedEndpoint)
            return failure(
              'CONFLICT',
              'El destino QA documentado no está disponible. Revisa Configuración.',
            );
          if (setup.value.status !== 'CONFIGURED_BLOCKED')
            return failure(
              'CONFLICT',
              'El destino guardado no coincide con el documentado. Actualízalo en Configuración.',
            );
          if (configuration.connectDeadlineMs === null)
            return failure('CONFLICT', 'Define el plazo de conexión en Configuración.');
          this.switchConnection.connect({
            environment: 'QA',
            endpoint: configuration.endpoint,
            connectDeadlineMs: configuration.connectDeadlineMs,
          });
        } else if (action === 'disconnect') this.switchConnection.disconnect('USER_DISCONNECTED');
        return { ok: true, value: this.switchConnection.snapshot() };
      } catch {
        return failure(
          'SERVICE_UNAVAILABLE',
          'No se pudo comprobar o cambiar la conexión al Switch.',
        );
      }
    });
  }
  saveSendConfiguration(payload: unknown): Promise<Result<SendConfigurationSnapshot>> {
    return this.serialize(async () => {
      if (this.balanceBusy)
        return failure(
          'CONFLICT',
          'Espera el resultado de la transacción antes de cambiar el destino o los plazos.',
        );
      const request = parseSaveSendConfiguration(payload);
      if (!request) return failure('VALIDATION_ERROR', 'Revisa el modo y los plazos de envío.');
      try {
        const preferences = await this.store.read();
        if (preferences.environment !== request.environment)
          return failure('CONFLICT', 'El ambiente cambió. Recarga antes de guardar.');
        return this.sendConfiguration
          ? await this.sendConfiguration.save(request)
          : failure('SERVICE_UNAVAILABLE', 'La configuración de envío no está disponible.');
      } catch {
        return failure('STORAGE_UNAVAILABLE', 'No se pudo verificar el ambiente.');
      }
    });
  }
  async prepareSendPlan(payload: unknown): Promise<Result<PreparedSendPlan>> {
    if (
      !isRecord(payload) ||
      Object.keys(payload).length !== 2 ||
      !Object.hasOwn(payload, 'draft') ||
      !Object.hasOwn(payload, 'configurationRevision') ||
      !isRevision(payload.configurationRevision)
    )
      return failure(
        'VALIDATION_ERROR',
        'Revisa el borrador y la configuración. No envíes tramas por este canal.',
      );
    const review = await this.reviewDraft(payload.draft);
    if (!review.ok) return review;
    return this.serialize(async () => {
      try {
        const preferences = await this.store.read();
        if (preferences.environment !== review.value.environment)
          return failure('CONFLICT', 'El ambiente cambió durante la preparación.');
        if (!this.sendConfiguration)
          return failure('SERVICE_UNAVAILABLE', 'La configuración de envío no está disponible.');
        const setup = await this.sendConfiguration.read(preferences.environment);
        if (!setup.ok) return setup;
        const configuration = setup.value.configuration;
        if (
          !configuration ||
          configuration.revision !== payload.configurationRevision ||
          setup.value.status === 'SOURCE_CHANGED'
        )
          return failure(
            'CONFLICT',
            'La configuración o el destino cambió. Recarga antes de preparar.',
          );
        return {
          ok: true,
          value: {
            planId: this.identity.uuid(),
            plannedAt: this.identity.now(),
            review: review.value,
            configurationRevision: configuration.revision,
            trigger: configuration.trigger,
            endpoint: { ...configuration.endpoint },
            status: 'BLOCKED',
            blockers: [
              ...setup.value.pending,
              ...review.value.blockers.map((item) => ({ id: item.id, label: item.label })),
            ].filter(
              (item, index, all) => all.findIndex((other) => other.id === item.id) === index,
            ),
            frameGenerated: false,
            transmissionAttempted: false,
          },
        };
      } catch {
        return failure(
          'STORAGE_UNAVAILABLE',
          'No se pudo preparar el envío desde la configuración local.',
        );
      }
    });
  }

  private balanceTarget(
    request: BalanceContextRequest,
  ): Promise<Result<{ target: BalanceTarget; connect: number | null; response: number | null }>> {
    return this.serialize(async () => {
      try {
        if ((await this.store.read()).environment !== 'QA')
          return failure('CONFLICT', 'La ejecución requiere el ambiente QA activo.');
        if (!this.catalogs || !this.sendConfiguration || !this.networkEvidence)
          return failure('SERVICE_UNAVAILABLE', 'Faltan catálogo o configuración de envío QA.');
        const catalog = await this.catalogs.execute(
          { kind: 'list', environment: 'QA' },
          {
            user: this.identity.user,
            machine: this.identity.hostname,
            timestamp: this.identity.now(),
          },
        );
        if (!catalog.ok) return catalog;
        const atm = selectableAtms(catalog.value).find((item) => item.id === request.draft.atmId);
        if (
          !atm ||
          atm.revision !== request.draft.atmRevision ||
          !/^[A-Z0-9]{8}$/.test(atm.terminalId)
        )
          return failure(
            'CONFLICT',
            'Recarga el ATM y verifica su Terminal ID de ocho caracteres.',
          );
        const network = this.networkEvidence.forEnvironment('QA');
        if (network.status !== 'DOCUMENTED' || network.evidence.entityId !== 205)
          return failure(
            'FORBIDDEN',
            'Este perfil ejecutable corresponde únicamente a CB 205 en QA.',
          );
        const setup = await this.sendConfiguration.read('QA');
        if (!setup.ok) return setup;
        const configuration = setup.value.configuration;
        if (
          !configuration ||
          configuration.revision !== request.configurationRevision ||
          setup.value.status !== 'CONFIGURED_BLOCKED'
        )
          return failure(
            'CONFLICT',
            'La configuración o el destino cambió. Recarga y revisa de nuevo.',
          );
        return {
          ok: true,
          value: {
            target: {
              ...request,
              terminalId: atm.terminalId,
              endpoint: { ...configuration.endpoint },
            },
            connect: configuration.connectDeadlineMs,
            response: configuration.observationWindowMs,
          },
        };
      } catch {
        return failure('STORAGE_UNAVAILABLE', 'No se pudo verificar el contexto de ejecución.');
      }
    });
  }
  getWithdrawalReadiness(payload: unknown): Promise<Result<BalanceReadiness>> {
    return this.getBalanceReadiness(payload, 'WITHDRAWAL');
  }
  executeWithdrawal(payload: unknown): Promise<Result<BalanceExecution>> {
    return this.executeBalance(payload, 'WITHDRAWAL');
  }
  getWithdrawalExecution(payload: unknown): Promise<Result<BalanceExecution | null>> {
    return this.getBalanceExecution(payload, 'WITHDRAWAL');
  }
  getWithdrawalHistory(payload: unknown): Promise<Result<readonly BalanceExecution[]>> {
    return this.getBalanceHistory(payload, 'WITHDRAWAL');
  }
  async getBalanceReadiness(
    payload: unknown,
    operation: 'BALANCE' | 'WITHDRAWAL' = 'BALANCE',
  ): Promise<Result<BalanceReadiness>> {
    const request =
      operation === 'WITHDRAWAL'
        ? parseWithdrawalContextRequest(payload)
        : parseBalanceContextRequest(payload);
    if (!request)
      return failure(
        'VALIDATION_ERROR',
        operation === 'WITHDRAWAL'
          ? 'Selecciona ATM, tarjeta y monto positivo para retiro de ahorros local en QA.'
          : 'Selecciona una tarjeta y un ATM para consulta de ahorros en QA.',
      );
    const context = await this.balanceTarget(request);
    if (!context.ok) return context;
    const service = operation === 'WITHDRAWAL' ? this.withdrawalService : this.balanceInquiry;
    const readiness = service
      ? await service.inspect(context.value.target)
      : structuredClone(
          operation === 'WITHDRAWAL' ? missingWithdrawalContext : missingBalanceContext,
        );
    const blockers = [...readiness.blockers];
    if (context.value.connect === null || context.value.response === null)
      blockers.push({
        id: 'SEND-DEADLINES',
        label: 'Define los plazos de conexión y respuesta en Configuración',
      });
    return {
      ok: true,
      value: {
        ready: readiness.ready && !blockers.length,
        blockers,
        ...(readiness.sequencesRemaining !== undefined
          ? { sequencesRemaining: readiness.sequencesRemaining }
          : {}),
      },
    };
  }
  async executeBalance(
    payload: unknown,
    operation: 'BALANCE' | 'WITHDRAWAL' = 'BALANCE',
    execution?: import('./balance-inquiry-service').BalanceExecutionContext,
  ): Promise<Result<BalanceExecution>> {
    const request =
      operation === 'WITHDRAWAL'
        ? parseWithdrawalExecutionRequest(payload)
        : parseBalanceExecutionRequest(payload);
    if (!request)
      return failure(
        'VALIDATION_ERROR',
        'Revisa el contexto de ejecución; este canal no acepta tramas ni secretos.',
      );
    const scope = operation === 'BALANCE' ? loadExecutionScope(execution) : undefined;
    if (
      this.balanceBusy &&
      (!scope || scope !== this.balanceScope || this.balanceCount >= execution!.concurrency!)
    )
      return failure(
        'CONFLICT',
        'Ya hay una transacción en curso. Consulta su referencia sin repetir el envío.',
      );
    if (!this.balanceCount) {
      this.balanceBusy = request.requestId;
      this.balanceScope = scope;
      this.financialIdle = new Promise<void>((resolve) => {
        this.resolveFinancialIdle = resolve;
      });
    }
    this.balanceCount++;
    try {
      const context = await this.balanceTarget({
        draft: request.draft,
        cardReadId: request.cardReadId,
        configurationRevision: request.configurationRevision,
      });
      if (!context.ok) return context;
      const service = operation === 'WITHDRAWAL' ? this.withdrawalService : this.balanceInquiry;
      if (!service)
        return failure('SERVICE_UNAVAILABLE', 'El servicio de ejecución no está configurado.');
      if (context.value.connect === null || context.value.response === null)
        return failure(
          'VALIDATION_ERROR',
          'Define los plazos de conexión y respuesta antes de enviar.',
        );
      return await service.execute(
        request,
        context.value.target,
        { connect: context.value.connect, response: context.value.response },
        async () => {
          const current = await this.balanceTarget({
            draft: request.draft,
            cardReadId: request.cardReadId,
            configurationRevision: request.configurationRevision,
          });
          return (
            current.ok &&
            current.value.target.terminalId === context.value.target.terminalId &&
            current.value.target.endpoint.host === context.value.target.endpoint.host &&
            current.value.target.endpoint.port === context.value.target.endpoint.port
          );
        },
        execution,
      );
    } finally {
      if (--this.balanceCount === 0) {
        this.balanceBusy = undefined;
        this.balanceScope = undefined;
        this.resolveFinancialIdle?.();
        this.resolveFinancialIdle = undefined;
      }
    }
  }
  getBalanceExecution(
    payload: unknown,
    operation: 'BALANCE' | 'WITHDRAWAL' = 'BALANCE',
  ): Promise<Result<BalanceExecution | null>> {
    return this.serialize(async () => {
      if (
        !isRecord(payload) ||
        Object.keys(payload).length !== 2 ||
        payload.environment !== 'QA' ||
        !isUuid(payload.requestId)
      )
        return failure('VALIDATION_ERROR', 'Revisa el ambiente y la referencia de ejecución.');
      try {
        if ((await this.store.read()).environment !== 'QA')
          return failure('CONFLICT', 'Consulta el resultado desde QA.');
        const service = operation === 'WITHDRAWAL' ? this.withdrawalService : this.balanceInquiry;
        return service
          ? await service.find(payload.requestId)
          : failure('SERVICE_UNAVAILABLE', 'El servicio de ejecución no está disponible.');
      } catch {
        return failure('STORAGE_UNAVAILABLE', 'No se pudo recuperar el resultado.');
      }
    });
  }

  getBalanceHistory(
    payload: unknown,
    operation: 'BALANCE' | 'WITHDRAWAL' = 'BALANCE',
  ): Promise<Result<readonly BalanceExecution[]>> {
    return this.serialize(async () => {
      if (parseEnvironmentRequest(payload) !== 'QA')
        return failure('VALIDATION_ERROR', 'El historial de este perfil corresponde a QA.');
      try {
        if ((await this.store.read()).environment !== 'QA')
          return failure('CONFLICT', 'Abre el historial desde QA.');
        const service = operation === 'WITHDRAWAL' ? this.withdrawalService : this.balanceInquiry;
        return service
          ? await service.history()
          : failure('SERVICE_UNAVAILABLE', 'El historial de transacciones no está disponible.');
      } catch {
        return failure(
          'STORAGE_UNAVAILABLE',
          'No se pudo recuperar el historial de transacciones.',
        );
      }
    });
  }

  catalog(kind: CatalogCommand['kind'], payload: unknown): Promise<Result<CatalogSnapshot>> {
    return this.serialize(async () => {
      if (this.balanceBusy && kind !== 'list')
        return failure(
          'CONFLICT',
          'Espera el resultado de la transacción antes de modificar perfiles o casos.',
        );
      let command: CatalogCommand | undefined;
      switch (kind) {
        case 'list': {
          const environment = parseEnvironmentRequest(payload);
          if (environment) command = { kind, environment };
          break;
        }
        case 'saveEntity': {
          const request = parseSaveEntityRequest(payload);
          if (request) command = { kind, request };
          break;
        }
        case 'saveAtm': {
          const request = parseSaveAtmRequest(payload);
          if (request) command = { kind, request };
          break;
        }
        case 'deleteEntity':
        case 'deleteAtm': {
          const request = parseDeleteRequest(payload);
          if (request) command = { kind, request };
          break;
        }
        case 'saveCase': {
          const request = parseSaveCaseRequest(payload);
          if (request) command = { kind, request };
          break;
        }
        case 'deleteCase': {
          const request = parseDeleteRequest(payload);
          if (request) command = { kind, request };
          break;
        }
      }
      if (!command)
        return failure(
          'VALIDATION_ERROR',
          'Revisa los campos, el ambiente y la versión del registro. No incluyas datos de tarjeta ni secretos.',
        );
      try {
        const current = await this.store.read();
        const environment =
          command.kind === 'list' ? command.environment : command.request.environment;
        if (environment !== current.environment)
          return failure('CONFLICT', 'El ambiente cambió. Recarga antes de guardar el catálogo.');
        if (!this.catalogs)
          return failure('SERVICE_UNAVAILABLE', 'El servicio de catálogos no está disponible.');
        return await this.catalogs.execute(command, {
          user: this.identity.user,
          machine: this.identity.hostname,
          timestamp: this.identity.now(),
        });
      } catch {
        return failure(
          'STORAGE_UNAVAILABLE',
          'No se pudo verificar la configuración o acceder al catálogo.',
        );
      }
    });
  }
}
