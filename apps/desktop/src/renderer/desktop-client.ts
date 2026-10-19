import { failure } from '../../../../packages/shared/src/contracts';
import type { DesktopApi, Result } from '../../../../packages/shared/src/contracts';

// El modo navegador solo muestra una advertencia. No fabrica un backend exitoso.
export class DesktopClient {
  constructor(
    private readonly api: DesktopApi | undefined,
    private readonly timeoutMs = 5_000,
  ) {}

  async call<T>(
    operation: (api: DesktopApi) => Promise<Result<T>>,
    timeoutMs = this.timeoutMs,
    timeoutMessage = 'El servicio local no respondió a tiempo. Vuelve a intentarlo.',
  ): Promise<Result<T>> {
    if (!this.api)
      return failure(
        'SERVICE_UNAVAILABLE',
        'Abre esta interfaz desde la aplicación Electron para usar los servicios locales.',
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(this.api),
        new Promise<Result<T>>((resolve) => {
          timer = setTimeout(() => resolve(failure('TIMEOUT', timeoutMessage)), timeoutMs);
        }),
      ]);
    } catch {
      return failure(
        'SERVICE_UNAVAILABLE',
        'No se pudo contactar al servicio local. Vuelve a intentarlo.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
