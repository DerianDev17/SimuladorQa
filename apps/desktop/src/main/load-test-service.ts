import type { LoadTestPlan } from '../../../../packages/domain/src/load-test';
import { parseLoadTestDraft } from '../../../../packages/domain/src/load-test';
import type { Result } from '../../../../packages/shared/src/contracts';
import { failure } from '../../../../packages/shared/src/contracts';
import type { PreferencesStore, RuntimeIdentity } from './ports';

// Legacy virtual-pool planner. Physical-card execution uses LoadRunService
// and requires a fresh card reference, which this draft does not contain.
export class LoadTestService {
  constructor(
    private readonly identity: RuntimeIdentity,
    private readonly preferences: Pick<PreferencesStore, 'read'>,
  ) {}

  async prepare(payload: unknown): Promise<Result<LoadTestPlan>> {
    const draft = parseLoadTestDraft(payload);
    if (!draft)
      return failure('VALIDATION_ERROR', 'Revisa la operación y los parámetros de la corrida QA.');
    let preferences: Awaited<ReturnType<PreferencesStore['read']>>;
    try {
      preferences = await this.preferences.read();
    } catch {
      return failure('STORAGE_UNAVAILABLE', 'No se pudo verificar el ambiente de la corrida.');
    }
    if (preferences.environment !== 'QA')
      return failure('FORBIDDEN', 'La preparación de carga solo está disponible en QA.');
    return {
      ok: true,
      value: {
        planId: this.identity.uuid(),
        createdAt: this.identity.now(),
        draft,
        status: 'BLOCKED_EXECUTION',
        blockers: [
          {
            id: 'LOAD_LIMITS_NOT_APPROVED',
            label:
              'El tope de 5 TPS es un límite local provisional; faltan validar ventana, concurrencia y cantidad/duración de la prueba.',
          },
          {
            id: 'QA_CARD_SOURCE_NOT_READY',
            label:
              'El pool virtual QA está autorizado, pero falta integrar el proveedor que genere PIN/EMV nuevos por consulta.',
          },
          {
            id: 'LOAD_EXECUTOR_NOT_IMPLEMENTED',
            label:
              'Este borrador virtual no es ejecutable. Usa Carga y estrés con una tarjeta física leída.',
          },
        ],
        frameGenerated: false,
        transmissionAttempted: false,
      },
    };
  }
}
