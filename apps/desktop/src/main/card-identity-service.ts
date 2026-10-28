import { redactCardDisplayText } from '../../../../packages/domain/src/card-reader';
import { randomUUID } from 'node:crypto';
import type {
  CardIdentityReading,
  CardIdentityRequest,
  CardReaderAdapter,
  CardReaderSnapshot,
} from '../../../../packages/domain/src/card-reader';
import { failure, type Result } from '../../../../packages/shared/src/contracts';
import { readEmvIdentity, type CardApduSession } from './adapters/emv-card-identity';

export class CardIdentityService {
  private session: CardApduSession | undefined;
  private reading: CardIdentityReading | undefined;
  private busy = false;
  private closed = false;
  private generation = 0;
  private privateFields = new Map<string, Uint8Array>();
  private leasing = false;
  private loadSession = false;
  private retainedReader: string | undefined;
  beginLoadSession(): void {
    if (this.closed || this.busy || this.leasing || this.loadSession)
      throw Error('CARD_UNAVAILABLE');
    this.loadSession = true;
    this.retainedReader = this.reading?.readerName;
  }
  endLoadSession(): void {
    this.loadSession = false;
    this.discard();
  }
  private checking:
    | { session: CardApduSession; generation: number; promise: Promise<CardIdentityReading | null> }
    | undefined;
  constructor(
    private readonly reader: CardReaderAdapter,
    private readonly connect: (name: string) => Promise<CardApduSession>,
    private readonly timeoutMs = 20000,
  ) {}
  isBusy(): boolean {
    return this.busy || this.leasing;
  }
  observePresence(snapshot: CardReaderSnapshot | null): void {
    if (
      (this.reading || this.retainedReader) &&
      !snapshot?.readers.some(
        (device) =>
          device.name === (this.reading?.readerName ?? this.retainedReader) &&
          device.state === 'CARD_PRESENT',
      )
    )
      this.discard();
  }
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
      redactCardDisplayText(request.readerName) !== request.readerName ||
      (request.terminalCountryCode !== undefined &&
        (typeof request.terminalCountryCode !== 'string' ||
          !/^(?!000)\d{3}$/.test(request.terminalCountryCode))) ||
      (request.applicationId !== undefined &&
        (typeof request.applicationId !== 'string' ||
          !/^(?:[A-F0-9]{2}){5,16}$/.test(request.applicationId)))
    )
      return failure('VALIDATION_ERROR', 'Selecciona un lector y una aplicación válidos.');
    if (this.closed) return failure('SERVICE_UNAVAILABLE', 'El servicio del lector está cerrado.');
    if (this.busy || this.leasing) return failure('IN_USE', 'La tarjeta está en uso.');
    this.busy = true;
    const reused =
      this.loadSession && this.retainedReader === request.readerName ? this.session : undefined;
    if (reused) this.session = undefined;
    this.discard();
    if (reused) {
      this.session = reused;
      this.retainedReader = request.readerName;
    }
    const generation = this.generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    try {
      const operation = async () => {
        const snapshot = reused ? undefined : await this.reader.inspect();
        if (expired || this.closed) throw Error('CARD_UNAVAILABLE');
        if (
          snapshot &&
          !snapshot.readers.some(
            (device) => device.name === request.readerName && device.state === 'CARD_PRESENT',
          )
        )
          throw Error('CARD_REMOVED');
        const session = reused ?? (await this.connect(request.readerName as string));
        if (reused) {
          if (!(await reused.isValid()) || !reused.beginTransaction) throw Error('CARD_REMOVED');
          await reused.beginTransaction();
        }
        if (expired || this.closed || this.generation !== generation) {
          session.close();
          throw Error('CARD_UNAVAILABLE');
        }
        this.session = session;
        if (this.loadSession) this.retainedReader = request.readerName as string;
        const reading = await readEmvIdentity(
          session,
          {
            readId: randomUUID(),
            readAt: new Date().toISOString(),
            readerName: request.readerName as string,
          },
          (request as unknown as CardIdentityRequest).applicationId,
          (request as unknown as CardIdentityRequest).terminalCountryCode,
          (fields) => {
            if (
              expired ||
              this.closed ||
              this.generation !== generation ||
              this.session !== session
            )
              throw Error('CARD_UNAVAILABLE');
            for (const [tag, value] of fields) this.privateFields.set(tag, Buffer.from(value));
          },
        );
        await session.releaseTransaction();
        const valid = await session.isValid();
        if (expired || this.closed || this.generation !== generation || this.session !== session)
          throw Error('CARD_UNAVAILABLE');
        if (!valid) throw Error('CARD_REMOVED');
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
      return { ok: true, value: structuredClone(reading) };
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
    if (this.leasing && this.reading && !this.closed)
      return Promise.resolve(structuredClone(this.reading));
    if (this.busy || !this.session || !this.reading || this.closed) return Promise.resolve(null);
    const session = this.session;
    const reading = this.reading;
    const generation = this.generation;
    if (this.checking?.session === session && this.checking.generation === generation)
      return this.checking.promise;
    const promise = (async () => {
      try {
        if (
          (await session.isValid()) &&
          this.session === session &&
          this.generation === generation &&
          !this.busy &&
          !this.closed
        )
          return structuredClone(reading);
      } catch {
        /* Removed/reset cards invalidate the retained PC/SC handle. */
      }
      if (this.session === session && this.generation === generation) this.discard();
      return null;
    })().finally(() => {
      if (this.checking?.promise === promise) this.checking = undefined;
    });
    this.checking = { session, generation, promise };
    return promise;
  }
  private discard(): void {
    this.generation++;
    this.session?.close();
    this.session = undefined;
    this.retainedReader = undefined;
    this.reading = undefined;
    for (const value of this.privateFields.values()) value.fill(0);
    this.privateFields.clear();
  }
  async withTransaction<T>(
    readId: string,
    signal: AbortSignal,
    use: (session: CardApduSession, fields: ReadonlyMap<string, Uint8Array>) => Promise<T>,
    terminalCountryCode?: string,
  ): Promise<T> {
    if (this.leasing || this.busy || signal.aborted) throw Error('CARD_UNAVAILABLE');
    const reading = await this.current();
    const session = this.session;
    if (
      this.busy ||
      this.leasing ||
      !reading ||
      reading.readId !== readId ||
      this.reading?.readId !== readId ||
      !session?.beginTransaction
    )
      throw Error('CARD_UNAVAILABLE');
    this.leasing = true;
    let retained = false;
    const cancel = () => this.discard();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      if (signal.aborted) throw Error('CARD_UNAVAILABLE');
      await session.beginTransaction();
      if (signal.aborted || !(await session.isValid())) throw Error('CARD_UNAVAILABLE');
      // The identity handle was shared while the user reviewed/entered PIN.
      // Reselect the exact AID and start a fresh GPO/read under the exclusive
      // transaction; another PC/SC client must not dictate our chip state.
      const previousPan = this.privateFields.get('5A');
      const freshFields = new Map<string, Uint8Array>();
      try {
        const fresh = await readEmvIdentity(
          session,
          { readId, readAt: reading.readAt, readerName: reading.readerName },
          reading.applicationId ?? undefined,
          terminalCountryCode,
          (fields) => {
            for (const [tag, value] of fields) freshFields.set(tag, Buffer.from(value));
          },
        );
        const freshPan = freshFields.get('5A');
        if (
          signal.aborted ||
          fresh.status !== 'READ' ||
          fresh.applicationId !== reading.applicationId ||
          !previousPan ||
          !freshPan ||
          !Buffer.from(previousPan).equals(Buffer.from(freshPan))
        )
          throw Error('CARD_UNAVAILABLE');
        for (const value of this.privateFields.values()) value.fill(0);
        this.privateFields.clear();
        for (const [tag, value] of freshFields) this.privateFields.set(tag, Buffer.from(value));
      } finally {
        for (const value of freshFields.values()) value.fill(0);
      }
      const value = await use(session, this.privateFields);
      if (signal.aborted) throw Error('CARD_UNAVAILABLE');
      if (this.loadSession) {
        try {
          await session.releaseTransaction();
        } catch {
          throw Error('CARD_UNAVAILABLE');
        }
        if (signal.aborted || this.session !== session || !this.loadSession)
          throw Error('CARD_UNAVAILABLE');
        // Keep only the handle. Every next operation still performs fresh
        // SELECT/GPO/READ and GENERATE AC; consumed reading IDs stay invalid.
        this.generation++;
        this.reading = undefined;
        for (const field of this.privateFields.values()) field.fill(0);
        this.privateFields.clear();
        retained = true;
      }
      return value;
    } finally {
      signal.removeEventListener('abort', cancel);
      if (!retained) this.discard();
      this.leasing = false;
    }
  }
  close(): void {
    this.closed = true;
    this.discard();
  }
}
