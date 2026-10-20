import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PhysicalCardLoadDriver } from '../../apps/desktop/src/main/physical-card-load-driver';
import { LoadPinSession } from '../../apps/desktop/src/main/adapters/load-pin-session';
import type { CardIdentityReading } from '../../packages/domain/src/card-reader';
import type { LoadRunRequest } from '../../packages/domain/src/load-run';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import type { DesktopApplication } from '../../apps/desktop/src/main/application';

function fixture() {
  const original: CardIdentityReading = {
    readId: randomUUID(),
    readAt: new Date().toISOString(),
    readerName: 'Synthetic',
    status: 'READ',
    applications: [],
    applicationId: 'A1B2C3D4E5F6',
    applicationLabel: 'QA',
    panMasked: '************2267',
    cardholderName: null,
    expiry: null,
  };
  const input: LoadRunRequest = {
    requestId: randomUUID(),
    cardReadId: original.readId,
    draft: {
      environment: 'QA',
      operation: 'BALANCE',
      mode: 'LOAD',
      atmId: randomUUID(),
      atmRevision: 1,
      targetTps: 5,
      concurrency: 1,
      maxTransactions: 2,
      durationSeconds: 60,
      rampUpSeconds: 0,
    },
  };
  const cards = {
    current: vi.fn(async () => original),
    read: vi.fn(async () => ({ ok: true as const, value: { ...original, readId: randomUUID() } })),
  };
  const ask = vi.fn(async () => Uint8Array.of(1, 2, 3, 4));
  const pins = new LoadPinSession({ request: ask });
  const application: Pick<
    DesktopApplication,
    'getSendConfiguration' | 'getBalanceReadiness' | 'executeBalance'
  > = {
    getSendConfiguration: vi.fn(async () => ({
      ok: true as const,
      value: {
        environment: 'QA' as const,
        status: 'CONFIGURED_BLOCKED' as const,
        documentedEndpoint: null,
        pending: [],
        configuration: {
          id: randomUUID(),
          revision: 1,
          environment: 'QA' as const,
          updatedAt: original.readAt,
          evidenceId: randomUUID(),
          trigger: 'ON_CLICK' as const,
          connectDeadlineMs: 1000,
          observationWindowMs: 1000,
          endpoint: { host: '127.0.0.1', port: 16100 },
        },
      },
    })),
    getBalanceReadiness: vi.fn(async () => ({
      ok: true as const,
      value: { ready: true, blockers: [], sequencesRemaining: 10 },
    })),
    executeBalance: vi.fn(async (_payload, _operation, execution) => {
      const pin = await pins.request(execution!.signal);
      pin!.fill(0);
      const value = approvedWithdrawalExecution();
      delete value.withdrawal;
      return { ok: true as const, value: { ...value, runId: execution!.runId } };
    }),
  };
  const journal = { read: vi.fn(async () => [] as BalanceExecution[]), write: vi.fn() };
  const runtime = {
    agentId: randomUUID(),
    hostname: 'test',
    user: 'test',
    version: 'test',
    uuid: randomUUID,
    now: () => new Date().toISOString(),
  };
  return {
    driver: new PhysicalCardLoadDriver(cards, application, pins, journal, runtime, () => {}),
    cards,
    application,
    ask,
    input,
    journal,
  };
}
describe('adaptador de carga con tarjeta física', () => {
  it('relee el chip, pide PIN una vez y entrega IDs nuevos bajo el mismo runId', async () => {
    const f = fixture();
    const source = await f.driver.prepare(f.input);
    if (!source.ok) throw Error('READY');
    const runId = randomUUID();
    const signal = new AbortController().signal;
    await source.value.execute(signal, runId);
    await source.value.execute(signal, runId);
    expect(f.cards.read).toHaveBeenCalledTimes(1);
    expect(f.ask).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(f.application.executeBalance).mock.calls;
    expect(calls[0]![0]).not.toEqual(calls[1]![0]);
    expect(calls.map((call) => call[2]?.runId)).toEqual([runId, runId]);
    source.value.close();
  });
  it('rechaza una referencia obsoleta y la falta de secuencias antes de pedir PIN', async () => {
    const f = fixture();
    expect(await f.driver.prepare({ ...f.input, cardReadId: randomUUID() })).toMatchObject({
      ok: false,
    });
    vi.mocked(f.application.getBalanceReadiness).mockResolvedValue({
      ok: true,
      value: { ready: true, blockers: [], sequencesRemaining: 0 },
    });
    expect(await f.driver.prepare(f.input)).toMatchObject({ ok: false });
    expect(f.ask).not.toHaveBeenCalled();
    expect(f.application.executeBalance).not.toHaveBeenCalled();
  });
  it('detiene la corrida cuando cambia la tarjeta o falla la nueva lectura', async () => {
    const f = fixture();
    const source = await f.driver.prepare(f.input);
    if (!source.ok) throw Error('READY');
    const signal = new AbortController().signal;
    const runId = randomUUID();
    await source.value.execute(signal, runId);
    f.cards.read.mockResolvedValue({
      ok: true,
      value: { ...(await f.cards.current()), readId: randomUUID(), panMasked: '************9999' },
    });
    expect(await source.value.execute(signal, runId)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(f.application.executeBalance).toHaveBeenCalledTimes(1);
    source.value.close();
  });
  it('un envío pendiente bloquea una nueva corrida antes de pedir PIN', async () => {
    const f = fixture();
    f.journal.read.mockResolvedValue([
      { ...approvedWithdrawalExecution(), outcome: 'PENDING', finishedAt: null },
    ]);
    expect(await f.driver.prepare(f.input)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(f.ask).not.toHaveBeenCalled();
  });
  it('conserva errores históricos sin impedir nuevas consultas de saldo explícitas', async () => {
    const f = fixture();
    const previous = {
      ...approvedWithdrawalExecution(),
      outcome: 'RESPONSE_TIMEOUT' as const,
      responseCode: null,
    };
    delete previous.withdrawal;
    f.journal.read.mockResolvedValue([previous]);
    const prepared = await f.driver.prepare(f.input);
    expect(prepared.ok).toBe(true);
    expect(f.journal.read).toHaveBeenCalledOnce();
    expect(f.application.executeBalance).not.toHaveBeenCalled();
    if (prepared.ok) prepared.value.close();
  });
});
