import {
  parseSaveLoadConfiguration,
  parseDeleteLoadConfiguration,
} from '../../../../packages/domain/src/load-configurations';
import type { SavedLoadConfiguration } from '../../../../packages/domain/src/load-configurations';
import type { Result } from '../../../../packages/shared/src/contracts';
import { failure } from '../../../../packages/shared/src/contracts';
import type { PreferencesStore } from './ports';
import { LoadConfigurationConflict } from './load-configuration-ports';
import type { LoadConfigurationStore } from './load-configuration-ports';
export class LoadConfigurationService {
  constructor(
    private readonly store: LoadConfigurationStore,
    private readonly preferences: Pick<PreferencesStore, 'read'>,
    private readonly busy: () => boolean,
  ) {}
  private async access(
    action: () => Promise<SavedLoadConfiguration[]>,
    mutation = false,
  ): Promise<Result<SavedLoadConfiguration[]>> {
    try {
      if ((await this.preferences.read()).environment !== 'QA')
        return failure('FORBIDDEN', 'Las configuraciones de carga pertenecen a QA.');
      if (mutation && this.busy())
        return failure(
          'IN_USE',
          'Espera al cierre de la corrida antes de cambiar configuraciones.',
        );
      return { ok: true, value: await action() };
    } catch (error) {
      return error instanceof LoadConfigurationConflict
        ? failure(
            'CONFLICT',
            'La configuración cambió o se alcanzó el límite de 50. Recarga la biblioteca antes de editar.',
          )
        : failure(
            'STORAGE_UNAVAILABLE',
            'No se pudo acceder a las configuraciones. Recarga antes de repetir cambios.',
          );
    }
  }
  list(payload: unknown): Promise<Result<SavedLoadConfiguration[]>> {
    if (payload !== undefined)
      return Promise.resolve(failure('VALIDATION_ERROR', 'Consulta de configuraciones inválida.'));
    return this.access(() => this.store.list());
  }
  save(payload: unknown): Promise<Result<SavedLoadConfiguration[]>> {
    const request = parseSaveLoadConfiguration(payload);
    if (!request)
      return Promise.resolve(
        failure(
          'VALIDATION_ERROR',
          'Revisa el nombre, los ATM y los parámetros de carga o estrés.',
        ),
      );
    return this.access(() => this.store.save(request), true);
  }
  delete(payload: unknown): Promise<Result<SavedLoadConfiguration[]>> {
    const request = parseDeleteLoadConfiguration(payload);
    if (!request)
      return Promise.resolve(failure('VALIDATION_ERROR', 'Selecciona una configuración vigente.'));
    return this.access(() => this.store.delete(request), true);
  }
}
