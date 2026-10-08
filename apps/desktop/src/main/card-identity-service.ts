import { randomUUID } from 'node:crypto';
import type {
  CardIdentityReading,
  CardIdentityRequest,
  CardReaderAdapter,
} from '../../../../packages/domain/src/card-reader';
import { failure, type Result } from '../../../../packages/shared/src/contracts';
import { readEmvIdentity, type CardApduSession } from './adapters/emv-card-identity';

export class CardIdentityService {
  private session: CardApduSession | undefined;
  private reading: CardIdentityReading | undefined;
  private busy = false;
  private closed = false;
  private checking:
    { session: CardApduSession; promise: Promise<CardIdentityReading | null> } | undefined;
  constructor(
    private readonly reader: CardReaderAdapter,
    private readonly connect: (name: string) => Promise<CardApduSession>,
    private readonly timeoutMs = 20000,
  ) {}
  async read(payload: unknown): Promise<Result<CardIdentityReading>> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return failure('VALIDATION_ERROR', 'Solicitud de lectura inválida.');
    const request = payload as Record<string, unknown>;
    if (
      Object.keys(request).some(
        (key) => !['readerName', 'applicationId', 'terminalCountryCode'].includes(key),
      ) ||
      typeof request.readerName !== 'string' ||
      !request.readerName.trim() ||
      request.readerName.length > 160 ||
      [...request.readerName].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      /\d{12,19}/.test(request.readerName) ||
      (request.terminalCountryCode !== undefined &&
        (typeof request.terminalCountryCode !== 'string' ||
          !/^(?!000)\d{3}$/.test(request.terminalCountryCode))) ||
      (request.applicationId !== undefined &&
        (typeof request.applicationId !== 'string' ||
          !/^(?:[A-F0-9]{2}){5,16}$/.test(request.applicationId)))
    )
      return failure('VALIDATION_ERROR', 'Selecciona un lector y una aplicación válidos.');
    if (this.closed) return failure('SERVICE_UNAVAILABLE', 'El servicio del lector está cerrado.');
    if (this.busy) return failure('IN_USE', 'Hay una lectura de chip en curso.');
    this.busy = true;
    this.discard();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    try {
      const operation = async () => {
        const snapshot = await this.reader.inspect();
        if (expired || this.closed) throw Error('CARD_UNAVAILABLE');
        if (
          !snapshot.readers.some(
            (device) => device.name === request.readerName && device.state === 'CARD_PRESENT',
          )
        )
          throw Error('CARD_REMOVED');
        const session = await this.connect(request.readerName as string);
        if (expired || this.closed) {
          session.close();
          throw Error('CARD_UNAVAILABLE');
        }
        this.session = session;
        const reading = await readEmvIdentity(
          session,
          {
            readId: randomUUID(),
            readAt: new Date().toISOString(),
            readerName: request.readerName as string,
          },
          (request as unknown as CardIdentityRequest).applicationId,
          (request as unknown as CardIdentityRequest).terminalCountryCode,
        );
        await session.releaseTransaction();
        if (expired || this.closed || !(await session.isValid())) throw Error('CARD_REMOVED');
        this.reading = reading;
        return reading;
      };
      const reading = await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            expired = true;
            this.discard();
            reject(Error('CARD_TIMEOUT'));
          }, this.timeoutMs);
        }),
      ]);
      return { ok: true, value: reading };
    } catch (error) {
      this.discard();
      const code = error instanceof Error ? error.message : '';
      if (code === 'CARD_TIMEOUT' || code === 'PCSC_TIMEOUT')
        return failure(
          'TIMEOUT',
          'La lectura del chip no respondió a tiempo. Vuelve a intentarlo.',
        );
      if (code === 'CARD_REMOVED')
        return failure('NOT_FOUND', 'La tarjeta se retiró o el lector ya no está disponible.');
      if (code === 'CARD_APPLICATION_CHANGED')
        return failure(
          'CONFLICT',
          'La aplicación seleccionada ya no está en esta tarjeta. Vuelve a leer el chip.',
        );
      return failure(
        'SERVICE_UNAVAILABLE',
        'No se pudo leer el chip. Inserta la tarjeta por contacto y revisa el lector.',
      );
    } finally {
      clearTimeout(timer);
      this.busy = false;
    }
  }
  current(): Promise<CardIdentityReading | null> {
    if (this.busy || !this.session || !this.reading || this.closed) return Promise.resolve(null);
    const session = this.session;
    const reading = this.reading;
    if (this.checking?.session === session) return this.checking.promise;
    const promise = (async () => {
      try {
        if ((await session.isValid()) && this.session === session && !this.busy) return reading;
      } catch {
        /* Removed/reset cards invalidate the retained PC/SC handle. */
      }
      if (this.session === session) this.discard();
      return null;
    })().finally(() => {
      if (this.checking?.promise === promise) this.checking = undefined;
    });
    this.checking = { session, promise };
    return promise;
  }
  private discard(): void {
    this.session?.close();
    this.session = undefined;
    this.reading = undefined;
  }
  close(): void {
    this.closed = true;
    this.discard();
  }
}
