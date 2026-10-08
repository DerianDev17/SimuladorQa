import {
  dataBlockers,
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
import type { ObservationSearch } from '../../../../packages/domain/src/observations';
import type { TransactionObserver } from './observation-port';
import type { NetworkEvidenceCatalog } from '../../../../packages/domain/src/network-evidence';
import type { CardReaderAdapter } from '../../../../packages/domain/src/card-reader';

// Las operaciones locales comparten cola. El observador verifica el ambiente antes
// y después de consultar, sin retener esa cola durante la espera de red.
export class DesktopApplication {
  private queue: Promise<unknown> = Promise.resolve();
  private environmentRevision = 0;
  private observationBusy = false;
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
      connection: 'NOT_CONFIGURED',
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

  catalog(kind: CatalogCommand['kind'], payload: unknown): Promise<Result<CatalogSnapshot>> {
    return this.serialize(async () => {
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
