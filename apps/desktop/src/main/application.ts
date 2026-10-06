import {
  dataBlockers,
  parseEnvironmentRequest,
  parsePreparationRequest,
  prepareTransaction,
} from '../../../../packages/domain/src/index';
import { failure } from '../../../../packages/shared/src/contracts';
import type { AppSnapshot, Result } from '../../../../packages/shared/src/contracts';
import type { Preparation } from '../../../../packages/domain/src/index';
import type { Preferences, PreferencesStore, RuntimeIdentity } from './ports';

// Toda operación comparte la cola: evita perder cambios y leer un ambiente intermedio.
export class DesktopApplication {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly store: PreferencesStore,
    private readonly identity: RuntimeIdentity,
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
      reader: 'NOT_CONFIGURED',
      connection: 'NOT_CONFIGURED',
      controlPlane: 'NOT_CONFIGURED',
      blockers: dataBlockers,
      audit: [...preferences.audit].reverse(),
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
}
