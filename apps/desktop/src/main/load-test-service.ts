import type { LoadTestPlan } from '../../../../packages/domain/src/load-test';
import { parseLoadTestDraft } from '../../../../packages/domain/src/load-test';
import type { Result } from '../../../../packages/shared/src/contracts';
import { failure } from '../../../../packages/shared/src/contracts';
import type { PreferencesStore, RuntimeIdentity } from './ports';

// The only executable operation would be balance inquiry, but the approved QA
// card source and a load runner are not available. This service only prepares
// a sanitized plan and intentionally has no financial transport method.
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
              'No hay un pool o generador de tarjetas QA autorizado para producir PIN/EMV nuevos en cada consulta.',
          },
          {
            id: 'LOAD_EXECUTOR_NOT_IMPLEMENTED',
            label:
              'La aplicación prepara el plan, pero todavía no dispone de un ejecutor de carga.',
          },
        ],
        frameGenerated: false,
        transmissionAttempted: false,
      },
    };
  }
}
