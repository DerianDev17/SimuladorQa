import {
  createVirtualCardFixtures,
  parseVirtualCardGenerationRequest,
} from '../../../../packages/domain/src/virtual-card-fixtures';
import type { VirtualCardFixture } from '../../../../packages/domain/src/virtual-card-fixtures';
import type { Result } from '../../../../packages/shared/src/contracts';
import { failure } from '../../../../packages/shared/src/contracts';
import type { PreferencesStore, RuntimeIdentity } from './ports';

export class VirtualCardGeneratorService {
  constructor(
    private readonly identity: RuntimeIdentity,
    private readonly preferences: Pick<PreferencesStore, 'read'>,
  ) {}

  async generate(payload: unknown): Promise<Result<VirtualCardFixture[]>> {
    const request = parseVirtualCardGenerationRequest(payload);
    if (!request)
      return failure('VALIDATION_ERROR', 'Elige una cantidad entre 1 y 20 tarjetas locales.');

    try {
      const preferences = await this.preferences.read();
      if (preferences.environment !== 'QA')
        return failure('FORBIDDEN', 'El generador local solo está disponible en QA.');
    } catch {
      return failure('STORAGE_UNAVAILABLE', 'No se pudo verificar el ambiente QA.');
    }

    return {
      ok: true,
      value: createVirtualCardFixtures(request.count, this.identity.uuid, this.identity.now),
    };
  }
}
