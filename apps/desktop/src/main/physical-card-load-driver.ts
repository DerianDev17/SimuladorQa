import type { LoadRunDriver, LoadRunSource } from './load-run-service';
import type { LoadRunRequest } from '../../../../packages/domain/src/load-run';
import type { LoadRunTimings } from '../../../../packages/domain/src/load-run';
import { loadTestAtms } from '../../../../packages/domain/src/load-test';
import { performance } from 'node:perf_hooks';
import type { BalanceContextRequest } from '../../../../packages/domain/src/balance-inquiry';
import type { CardIdentityService } from './card-identity-service';
import type { DesktopApplication } from './application';
import type { LoadPinSession } from './adapters/load-pin-session';
import type { RuntimeIdentity } from './ports';
import type { BalanceJournal } from './balance-ports';
import { failure } from '../../../../packages/shared/src/contracts';
import type { Result } from '../../../../packages/shared/src/contracts';
import { LoadSendLimiter } from './infrastructure/load-send-limiter';

export class PhysicalCardLoadDriver implements LoadRunDriver {
  constructor(
    private readonly cards: Pick<CardIdentityService, 'current' | 'read'> &
      Partial<Pick<CardIdentityService, 'beginLoadSession' | 'endLoadSession'>>,
    private readonly application: Pick<
      DesktopApplication,
      'getSendConfiguration' | 'getBalanceReadiness' | 'executeBalance'
    >,
    private readonly pins: LoadPinSession,
    private readonly journal: BalanceJournal,
    private readonly identity: RuntimeIdentity,
    private readonly publish: () => void,
    private readonly cipherSession?: { begin(): void; end(): void },
  ) {}
  async prepare(request: LoadRunRequest): Promise<Result<LoadRunSource>> {
    const original = await this.cards.current();
    if (
      !original ||
      original.status !== 'READ' ||
      original.readId !== request.cardReadId ||
      !original.applicationId ||
      !original.panMasked
    )
      return failure('CONFLICT', 'Lee y selecciona la tarjeta física antes de iniciar la corrida.');
    const setup = await this.application.getSendConfiguration({ environment: 'QA' });
    if (!setup.ok) return setup;
    const configuration = setup.value.configuration;
    if (!configuration)
      return failure('CONFLICT', 'Configura el destino y los plazos del Switch QA.');
    const contexts: BalanceContextRequest[] = loadTestAtms(request.draft).map((atm) => ({
      draft: {
        environment: 'QA',
        transaction: 'BALANCE',
        scenario: 'LOCAL',
        account: 'SAVINGS',
        amount: null,
        atmId: atm.atmId,
        atmRevision: atm.atmRevision,
      },
      configurationRevision: configuration.revision,
      cardReadId: original.readId,
    }));
    for (const context of contexts) {
      const ready = await this.application.getBalanceReadiness(context);
      if (!ready.ok) return ready;
      if (!ready.value.ready)
        return failure(
          'CONFLICT',
          ready.value.blockers.map((blocker) => blocker.label).join('. ') ||
            'Uno de los perfiles de saldo no está listo.',
        );
      // Template ATMs share one pool: never sum availability across profiles.
      if (
        ready.value.sequencesRemaining === undefined ||
        ready.value.sequencesRemaining < request.draft.maxTransactions
      )
        return failure(
          'CONFLICT',
          'No hay suficientes secuencias QA disponibles para la cantidad solicitada.',
        );
    }
    const history = await this.journal.read();
    if (history.some((execution) => execution.outcome === 'PENDING'))
      return failure(
        'CONFLICT',
        'El diario contiene una operación pendiente. Revisa su correlación antes de otra corrida.',
      );
    try {
      this.pins.begin();
      this.cards.beginLoadSession?.();
      this.cipherSession?.begin();
    } catch (error) {
      this.pins.end();
      this.cards.endLoadSession?.();
      this.cipherSession?.end();
      throw error;
    }
    let next = 0;
    let closed = false;
    let preparing: Promise<void> = Promise.resolve();
    const limiter = new LoadSendLimiter(request.draft);
    return {
      ok: true,
      value: {
        readerName: original.readerName,
        close: () => {
          if (closed) return;
          closed = true;
          this.pins.end();
          this.cards.endLoadSession?.();
          this.cipherSession?.end();
        },
        execute: async (signal, runId, slot) => {
          if (closed || signal.aborted) return failure('CONFLICT', 'La corrida fue detenida.');
          const index = slot?.index ?? next++;
          const context = contexts[index % contexts.length]!;
          const first = index === 0;
          const started = performance.now();
          const deadline = slot?.deadline ?? started + request.draft.durationSeconds * 1000;
          const prior = preparing;
          let release!: () => void;
          preparing = new Promise<void>((resolve) => {
            release = resolve;
          });
          await prior;
          const queueWaitMs = Math.round(performance.now() - started);
          try {
            if (closed || signal.aborted)
              return failure('CONFLICT', 'La corrida terminó antes de preparar esta consulta.');
            if (performance.now() >= deadline)
              return {
                ...failure('CONFLICT', 'Duración alcanzada antes de preparar la consulta.'),
                skipped: 'DURATION' as const,
              };
            const phases: Omit<
              LoadRunTimings,
              'cardReadMs' | 'otherMs' | 'totalMs' | 'queueWaitMs' | 'rateLimitMs'
            > = {
              inspectMs: 0,
              contextMs: 0,
              validationMs: 0,
              journalMs: 0,
              transportMs: 0,
            };
            let rateLimitMs = 0,
              sendValidationMs = 0;
            let durationSkipped = false;
            const readStarted = performance.now();
            const reading = first
              ? { ok: true as const, value: original }
              : await this.cards.read({
                  readerName: original.readerName,
                  applicationId: original.applicationId,
                  terminalCountryCode: '218',
                });
            const cardReadMs = Math.round(performance.now() - readStarted);
            this.publish();
            if (!reading.ok) return reading;
            if (closed || signal.aborted) return failure('CONFLICT', 'La corrida fue detenida.');
            if (
              reading.value.status !== 'READ' ||
              reading.value.panMasked !== original.panMasked ||
              reading.value.applicationId !== original.applicationId
            )
              return failure('CONFLICT', 'La tarjeta cambió. Se detuvo la corrida.');
            try {
              const result = await this.application.executeBalance(
                {
                  ...context,
                  cardReadId: reading.value.readId,
                  requestId: this.identity.uuid(),
                },
                'BALANCE',
                {
                  runId,
                  signal,
                  concurrency: request.draft.concurrency,
                  deadline,
                  withWrite: async (write) => {
                    const waitStarted = performance.now();
                    let admitted = false;
                    try {
                      await limiter.send(signal, deadline, async () => {
                        admitted = true;
                        rateLimitMs += Math.round(performance.now() - waitStarted);
                        const previousValidation = phases.validationMs;
                        try {
                          await write();
                        } finally {
                          sendValidationMs += phases.validationMs - previousValidation;
                        }
                      });
                    } catch (error) {
                      if (!signal.aborted && performance.now() >= deadline) durationSkipped = true;
                      throw error;
                    } finally {
                      if (!admitted) rateLimitMs += Math.round(performance.now() - waitStarted);
                    }
                  },
                  onPrepared: release,
                  onPhase: (phase, elapsedMs) => {
                    const key = `${phase}Ms` as keyof typeof phases;
                    phases[key] +=
                      phase === 'transport'
                        ? Math.max(0, elapsedMs - rateLimitMs - sendValidationMs)
                        : elapsedMs;
                  },
                },
              );
              if (!result.ok) return result;
              if (durationSkipped && !result.value.transmissionAttempted)
                return { ...result, skipped: 'DURATION' as const };
              const totalMs = Math.round(performance.now() - started);
              const measuredMs =
                queueWaitMs +
                rateLimitMs +
                cardReadMs +
                Object.values(phases).reduce((sum, value) => sum + value, 0);
              return {
                ok: true,
                value: {
                  ...result.value,
                  loadTimings: {
                    cardReadMs,
                    queueWaitMs,
                    rateLimitMs,
                    ...phases,
                    otherMs: Math.max(0, totalMs - measuredMs),
                    totalMs,
                  },
                },
              };
            } finally {
              this.publish();
            }
          } finally {
            release();
          }
        },
      },
    };
  }
}
