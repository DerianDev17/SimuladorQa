import type { Environment } from '../../../../packages/domain/src/index';
import {
  parseSaveSendConfiguration,
  sendConfigurationSnapshot,
} from '../../../../packages/domain/src/send-configuration';
import type { SendConfigurationSnapshot } from '../../../../packages/domain/src/send-configuration';
import type { NetworkEvidenceCatalog } from '../../../../packages/domain/src/network-evidence';
import { failure } from '../../../../packages/shared/src/contracts';
import type { Result } from '../../../../packages/shared/src/contracts';
import type { RuntimeIdentity } from './ports';
import type { SendConfigurationStore } from './send-configuration-port';

// Read/save/preflight only. This service has no transport or socket dependency.
export class SendConfigurationService {
  constructor(
    private readonly store: SendConfigurationStore,
    private readonly evidence: NetworkEvidenceCatalog,
    private readonly identity: RuntimeIdentity,
  ) {}
  async initializeDocumentedQa(): Promise<Result<SendConfigurationSnapshot>> {
    const current = await this.read('QA');
    if (!current.ok || current.value.configuration || !current.value.documentedEndpoint)
      return current;
    return this.save({
      environment: 'QA',
      revision: null,
      values: {
        evidenceId: current.value.documentedEndpoint.evidenceId,
        trigger: 'ON_CLICK',
        connectDeadlineMs: null,
        observationWindowMs: null,
      },
    });
  }
  async read(environment: Environment): Promise<Result<SendConfigurationSnapshot>> {
    try {
      const file = await this.store.read();
      const network = this.evidence.forEnvironment(environment);
      return {
        ok: true,
        value: sendConfigurationSnapshot(
          environment,
          file.configurations.find((item) => item.environment === environment),
          network.status === 'DOCUMENTED' ? network.evidence : undefined,
        ),
      };
    } catch {
      return failure(
        'STORAGE_UNAVAILABLE',
        'No se pudo leer la configuración de envío. El archivo se conserva.',
      );
    }
  }
  async save(payload: unknown): Promise<Result<SendConfigurationSnapshot>> {
    const request = parseSaveSendConfiguration(payload);
    if (!request)
      return failure(
        'VALIDATION_ERROR',
        'Revisa el modo y los plazos. No incluyas tramas ni datos de tarjeta.',
      );
    const network = this.evidence.forEnvironment(request.environment);
    if (network.status !== 'DOCUMENTED' || network.evidence.id !== request.values.evidenceId)
      return failure(
        'CONFLICT',
        'El destino documentado cambió o no está disponible. Recarga la configuración.',
      );
    try {
      const file = await this.store.read();
      const current = file.configurations.find((item) => item.environment === request.environment);
      if ((current?.revision ?? null) !== request.revision)
        return failure('CONFLICT', 'La configuración cambió. Recarga antes de guardar.');
      const configuration = {
        ...request.values,
        id: current?.id ?? this.identity.uuid(),
        environment: request.environment,
        revision: (current?.revision ?? 0) + 1,
        updatedAt: this.identity.now(),
        endpoint: { ...network.evidence.ingress },
      };
      file.configurations = [
        ...file.configurations.filter((item) => item.environment !== request.environment),
        configuration,
      ];
      file.audit = [
        ...file.audit,
        {
          id: this.identity.uuid(),
          timestamp: configuration.updatedAt,
          environment: request.environment,
          configurationId: configuration.id,
          revision: configuration.revision,
          user: this.identity.user,
          machine: this.identity.hostname,
        },
      ].slice(-100);
      await this.store.write(file);
      return {
        ok: true,
        value: sendConfigurationSnapshot(request.environment, configuration, network.evidence),
      };
    } catch {
      return failure(
        'STORAGE_UNAVAILABLE',
        'No se pudo guardar la configuración de envío. Recarga antes de reintentar.',
      );
    }
  }
}
