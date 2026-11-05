import {
  parseLoadHistoryQuery,
  parseLoadHistoryId,
} from '../../../../packages/domain/src/load-history';
import type { LoadHistoryPage } from '../../../../packages/domain/src/load-history';
import type { LoadRunSnapshot } from '../../../../packages/domain/src/load-run';
import { failure } from '../../../../packages/shared/src/contracts';
import type { Result } from '../../../../packages/shared/src/contracts';
import type { LoadHistoryStore } from './load-history-ports';
import type { PreferencesStore } from './ports';

export class LoadHistoryService {
  constructor(
    private readonly store: LoadHistoryStore,
    private readonly preferences: Pick<PreferencesStore, 'read'>,
    private readonly recover: () => Promise<Result<LoadRunSnapshot | null>>,
  ) {}
  private async read<T>(operation: () => Promise<T>): Promise<Result<T>> {
    try {
      if ((await this.preferences.read()).environment !== 'QA')
        return failure('FORBIDDEN', 'El historial de carga está disponible en QA.');
      const recovered = await this.recover();
      if (!recovered.ok) return recovered;
      return { ok: true, value: await operation() };
    } catch {
      return failure(
        'STORAGE_UNAVAILABLE',
        'No se pudo consultar el historial de carga. Reintenta la consulta.',
      );
    }
  }
  async list(payload: unknown): Promise<Result<LoadHistoryPage>> {
    const query = parseLoadHistoryQuery(payload);
    if (!query) return failure('VALIDATION_ERROR', 'Revisa las fechas y filtros del historial.');
    return this.read(() => this.store.list(query));
  }
  async get(payload: unknown): Promise<Result<LoadRunSnapshot | null>> {
    const id = parseLoadHistoryId(payload);
    if (!id) return failure('VALIDATION_ERROR', 'Identificador de corrida inválido.');
    return this.read(() => this.store.get(id));
  }
}
