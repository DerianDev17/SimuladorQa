import type {
  AtmLocalInspection,
  InspectQaAtmRequest,
} from '../../../../packages/domain/src/atm-onboarding';
import { qaAtmEntityChecks } from '../../../../packages/domain/src/atm-onboarding';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import type { SendConfigurationSnapshot } from '../../../../packages/domain/src/send-configuration';
import { failure, type Result } from '../../../../packages/shared/src/contracts';
import type { AtmConfigurationInspectionPort, AtmInspectionPort } from './atm-inspection-port';

export class AtmInspectionService implements AtmInspectionPort {
  constructor(
    private readonly configuration: AtmConfigurationInspectionPort,
    private readonly send: { read(environment: 'QA'): Promise<Result<SendConfigurationSnapshot>> },
    private readonly now: () => string,
    private readonly catalog: () => Promise<CatalogSnapshot>,
    private readonly timeoutMs = 4000,
  ) {}

  async inspect(request: InspectQaAtmRequest): Promise<Result<AtmLocalInspection>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.read(request),
        new Promise<Result<AtmLocalInspection>>((resolve) => {
          timer = setTimeout(
            () =>
              resolve(
                failure(
                  'TIMEOUT',
                  'La verificación local agotó su plazo. Actualiza para comprobar de nuevo.',
                ),
              ),
            this.timeoutMs,
          );
        }),
      ]);
    } catch {
      return failure(
        'SERVICE_UNAVAILABLE',
        'No se pudo verificar la configuración local. Actualiza el diagnóstico.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async read(request: InspectQaAtmRequest): Promise<Result<AtmLocalInspection>> {
    const initial = await this.catalog();
    const atm = initial.atms.find((item) => item.id === request.atmId);
    const entity = initial.entities.find((item) => item.id === atm?.entityId);
    const settings = await this.send.read('QA');
    if (!settings.ok) return settings;
    const config = settings.value.configuration;
    const checks: AtmLocalInspection['checks'][number][] = [...qaAtmEntityChecks(entity)];
    const currentAtm =
      initial.environment === 'QA' &&
      atm?.environment === 'QA' &&
      atm.active &&
      atm.revision === request.revision;
    checks.push({
      id: 'ATM',
      status: currentAtm ? 'VERIFIED' : 'ACTION_REQUIRED',
      label: currentAtm
        ? 'ATM activo y revisión vigente'
        : 'El ATM cambió, está inactivo o no está disponible en Qa',
      action: currentAtm ? '' : 'Recarga el catálogo y verifica el perfil.',
    });
    const result: AtmLocalInspection = {
      atmId: request.atmId,
      revision: request.revision,
      checkedAt: this.now(),
      configurationRevision: config?.revision ?? null,
      checks,
      readyForBalanceTest: false,
      ...(entity
        ? {
            entity: {
              id: entity.id,
              revision: entity.revision,
              code: entity.code,
              name: entity.name,
              networkType: entity.networkType,
              memberTypes: entity.memberTypes ?? [],
              active: entity.active,
            },
          }
        : {}),
    };
    const deadlines = !!config?.connectDeadlineMs && !!config.observationWindowMs;
    checks.push({
      id: 'SEND',
      status: deadlines ? 'VERIFIED' : 'ACTION_REQUIRED',
      label: deadlines ? 'Destino y plazos configurados' : 'Faltan destino o plazos de envío',
      action: deadlines ? '' : 'Completa la configuración de envío.',
    });
    if (config && checks.every((check) => check.status === 'VERIFIED')) {
      try {
        const local = await this.configuration.inspectLocal(request, config.endpoint);
        result.source = local.source;
        result.sequencesRemaining = local.sequencesRemaining;
        checks.push(
          {
            id: 'PROFILE',
            status: 'VERIFIED',
            label:
              local.source === 'ATM20521'
                ? 'Configuración heredada de ATM20521; destino compatible'
                : 'Perfil específico disponible; destino compatible',
            action: '',
          },
          {
            id: 'SECURITY',
            status: local.securityAvailable ? 'VERIFIED' : 'ACTION_REQUIRED',
            label: local.securityAvailable
              ? 'Seguridad TEST disponible'
              : 'Seguridad TEST no disponible',
            action: local.securityAvailable
              ? ''
              : 'Revisa la configuración protegida de la estación.',
          },
          {
            id: 'POOL',
            status: local.sequencesRemaining > 0 ? 'VERIFIED' : 'ACTION_REQUIRED',
            label: `${local.sequencesRemaining} secuencias disponibles en el pool de origen`,
            action:
              local.sequencesRemaining > 0
                ? 'Crear otro ATM no repone ni duplica reservas.'
                : 'Solicita la reposición del pool aprobado.',
          },
        );
      } catch (error) {
        const changed =
          error instanceof Error &&
          ['QA_PROFILE_CHANGED', 'QA_TEMPLATE_ATM_INVALID'].includes(error.message);
        checks.push({
          id: 'PROFILE',
          status: 'ACTION_REQUIRED',
          label: changed
            ? 'El ATM o la plantilla cambió o no está activo en QA/205'
            : 'No se pudo verificar el perfil y su compatibilidad con el destino',
          action: 'Recarga el catálogo y revisa ATM20521 y la configuración de envío.',
        });
      }
      const latest = await this.send.read('QA');
      if (!latest.ok) return latest;
      if (
        latest.value.configuration?.revision !== config.revision ||
        latest.value.configuration.id !== config.id
      )
        return failure(
          'CONFLICT',
          'La configuración cambió durante la verificación. Actualiza el diagnóstico.',
        );
    } else
      checks.push({
        id: 'PROFILE',
        status: 'NOT_CHECKED',
        label: 'Plantilla, seguridad y reservas pendientes de verificar',
        action: 'Resuelve los requisitos anteriores y vuelve a verificar.',
      });
    const latestCatalog = await this.catalog();
    if (
      latestCatalog.environment !== initial.environment ||
      JSON.stringify(latestCatalog.atms.find((item) => item.id === request.atmId)) !==
        JSON.stringify(atm) ||
      JSON.stringify(latestCatalog.entities.find((item) => item.id === entity?.id)) !==
        JSON.stringify(entity)
    )
      return failure(
        'CONFLICT',
        'El ATM o la entidad cambió durante la verificación. Recarga el catálogo.',
      );
    result.readyForBalanceTest = checks.every((check) => check.status === 'VERIFIED');
    checks.push({
      id: 'HOST',
      status: 'NOT_CHECKED',
      label: 'Aceptación del host no comprobada',
      action: 'Realiza la prueba guiada de saldo con un terminal habilitado en el switch.',
    });
    result.checkedAt = this.now();
    return { ok: true, value: result };
  }
}
