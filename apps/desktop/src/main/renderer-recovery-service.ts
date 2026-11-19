import { failure } from '../../../../packages/shared/src/contracts';
import type { RendererRecoveryStatus, Result } from '../../../../packages/shared/src/contracts';
import type { FinancialExecutionPort } from './financial-execution-port';
import type { PreferencesStore } from './ports';

export class RendererRecoveryService {
  constructor(
    private readonly busy: () => boolean,
    private readonly sources: readonly Pick<FinancialExecutionPort, 'history'>[],
    private readonly preferences: Pick<PreferencesStore, 'read'>,
  ) {}

  async inspect(payload: unknown): Promise<Result<RendererRecoveryStatus>> {
    if (payload !== undefined)
      return failure('VALIDATION_ERROR', 'La consulta de recuperación no admite parámetros.');
    try {
      if ((await this.preferences.read()).environment !== 'QA')
        return failure('FORBIDDEN', 'La recuperación requiere Qa.');
      if (this.busy()) return { ok: true, value: { busy: true, recent: [] } };
      const results = await Promise.all(this.sources.map((source) => source.history()));
      if (results.some((result) => !result.ok)) throw Error('RECOVERY_UNAVAILABLE');
      const recent = results
        .flatMap((result) => (result.ok ? result.value : []))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 10)
        .map(({ requestId, outcome, startedAt }) => ({ requestId, outcome, startedAt }));
      return { ok: true, value: { busy: this.busy(), recent } };
    } catch {
      return failure(
        'STORAGE_UNAVAILABLE',
        'No se pudo comprobar el estado y el historial. Vuelve a consultar antes de recuperar la interfaz.',
      );
    }
  }
}
