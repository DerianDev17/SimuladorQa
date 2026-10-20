import {
  createSavedCardProfile,
  parseDeleteCardProfileRequest,
  parseSaveCardProfileRequest,
  parseUpdateCardProfileRequest,
  savedCardProfileLimits,
  updateSavedCardProfile,
} from '../../../../packages/domain/src/saved-card-profiles';
import type { SavedCardProfile } from '../../../../packages/domain/src/saved-card-profiles';
import type { Result } from '../../../../packages/shared/src/contracts';
import { failure } from '../../../../packages/shared/src/contracts';
import type { CardIdentityService } from './card-identity-service';
import type { PreferencesStore, RuntimeIdentity } from './ports';
import type { SavedCardProfileStore } from './infrastructure/saved-card-profile-store';

export class SavedCardProfileService {
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly cards: Pick<CardIdentityService, 'current'>,
    private readonly preferences: Pick<PreferencesStore, 'read'>,
    private readonly store: SavedCardProfileStore,
    private readonly identity: RuntimeIdentity,
  ) {}

  async list(payload: unknown): Promise<Result<readonly SavedCardProfile[]>> {
    if (payload !== undefined)
      return failure('VALIDATION_ERROR', 'Solicitud de perfiles de tarjeta inválida.');
    const qa = await this.requireQa();
    if (qa !== true) return qa;
    try {
      return { ok: true, value: (await this.store.read()).profiles };
    } catch {
      return failure('STORAGE_UNAVAILABLE', 'No se pudieron leer los perfiles locales de QA.');
    }
  }

  async save(payload: unknown): Promise<Result<readonly SavedCardProfile[]>> {
    const request = parseSaveCardProfileRequest(payload);
    if (!request)
      return failure(
        'VALIDATION_ERROR',
        'Ingresa un alias de 2 a 40 caracteres y una lectura vigente.',
      );
    return this.serializeMutation(async () => {
      const qa = await this.requireQa();
      if (qa !== true) return qa;

      let reading;
      try {
        reading = await this.cards.current();
      } catch {
        return failure(
          'SERVICE_UNAVAILABLE',
          'No se pudo confirmar la tarjeta que sigue en el lector.',
        );
      }
      if (!reading || reading.status !== 'READ' || reading.readId !== request.readId)
        return failure(
          'CONFLICT',
          'Vuelve a leer la tarjeta presente antes de guardar su referencia.',
        );
      const profile = createSavedCardProfile(
        reading,
        request,
        this.identity.uuid(),
        this.identity.now(),
      );
      if (!profile)
        return failure(
          'VALIDATION_ERROR',
          'La lectura actual no contiene una identidad válida para guardar.',
        );

      try {
        const current = await this.store.read();
        if (current.profiles.length >= savedCardProfileLimits.count)
          return failure(
            'VALIDATION_ERROR',
            'El inventario local alcanzó el máximo de 100 perfiles.',
          );
        const profiles = [profile, ...current.profiles];
        await this.store.write({ version: 2, profiles });
        return { ok: true, value: profiles };
      } catch {
        return failure('STORAGE_UNAVAILABLE', 'No se pudo guardar el perfil local de QA.');
      }
    });
  }

  async delete(payload: unknown): Promise<Result<readonly SavedCardProfile[]>> {
    const request = parseDeleteCardProfileRequest(payload);
    if (!request) return failure('VALIDATION_ERROR', 'Selecciona un perfil local válido.');
    return this.serializeMutation(async () => {
      const qa = await this.requireQa();
      if (qa !== true) return qa;
      try {
        const current = await this.store.read();
        if (!current.profiles.some((profile) => profile.id === request.id))
          return failure('NOT_FOUND', 'El perfil local ya no existe.');
        const profiles = current.profiles.filter((profile) => profile.id !== request.id);
        await this.store.write({ version: 2, profiles });
        return { ok: true, value: profiles };
      } catch {
        return failure('STORAGE_UNAVAILABLE', 'No se pudo actualizar el inventario local de QA.');
      }
    });
  }

  async update(payload: unknown): Promise<Result<readonly SavedCardProfile[]>> {
    const request = parseUpdateCardProfileRequest(payload);
    if (!request)
      return failure(
        'VALIDATION_ERROR',
        'Ingresa un alias de 2 a 40 caracteres y una cuenta QA válida.',
      );
    return this.serializeMutation(async () => {
      const qa = await this.requireQa();
      if (qa !== true) return qa;
      try {
        const current = await this.store.read();
        const existing = current.profiles.find((profile) => profile.id === request.id);
        if (!existing) return failure('NOT_FOUND', 'El perfil local ya no existe.');
        const updated = updateSavedCardProfile(existing, request);
        if (!updated)
          return failure('VALIDATION_ERROR', 'No se pudo validar la configuración del perfil.');
        const profiles = current.profiles.map((profile) =>
          profile.id === updated.id ? updated : profile,
        );
        await this.store.write({ version: 2, profiles });
        return { ok: true, value: profiles };
      } catch {
        return failure('STORAGE_UNAVAILABLE', 'No se pudo actualizar el perfil local de QA.');
      }
    });
  }

  private async requireQa(): Promise<true | Result<never>> {
    try {
      const preferences = await this.preferences.read();
      return preferences.environment === 'QA'
        ? true
        : failure('FORBIDDEN', 'El inventario de tarjetas solo está disponible en QA.');
    } catch {
      return failure('STORAGE_UNAVAILABLE', 'No se pudo confirmar que el ambiente sea QA.');
    }
  }

  private serializeMutation(
    operation: () => Promise<Result<readonly SavedCardProfile[]>>,
  ): Promise<Result<readonly SavedCardProfile[]>> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
