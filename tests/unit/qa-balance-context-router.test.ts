import { describe, expect, it, vi } from 'vitest';
import { QaBalanceContextRouter } from '../../apps/desktop/src/main/qa-balance-context-router';
import type { BalanceContextProvider } from '../../apps/desktop/src/main/balance-ports';
import { balanceLease, balanceTarget } from '../helpers/balance-inquiry';

function setup() {
  const router = new QaBalanceContextRouter();
  const target = balanceTarget();
  const provider: BalanceContextProvider = {
    inspect: vi.fn(async () => ({ ready: true, blockers: [] })),
    acquire: vi.fn(async (input) => balanceLease(input)),
  };
  const binding = {
    atmId: target.draft.atmId!,
    atmRevision: target.draft.atmRevision!,
    terminalId: target.terminalId,
    endpoint: { ...target.endpoint },
    provider,
  };
  router.bind(binding);
  return { router, target, provider, binding };
}

describe('proveedor QA independiente por perfil ATM', () => {
  it('separa operaciones y rechaza un lease de saldo en el router de retiro', async () => {
    const { binding, target, provider } = setup();
    const router = new QaBalanceContextRouter('WITHDRAWAL');
    router.bind(binding);
    expect((await router.inspect(target)).ready).toBe(false);
    target.draft = { ...target.draft, transaction: 'WITHDRAWAL_APPROVED', amount: '20.00' };
    expect((await router.inspect(target)).ready).toBe(true);
    await expect(router.acquire(target, new AbortController().signal)).rejects.toThrow();
    vi.mocked(provider.acquire).mockImplementation(async (input) => ({
      ...balanceLease(input),
      amount: '20.00',
    }));
    const lease = await router.acquire(target, new AbortController().signal);
    expect(lease.amount).toBe('20.00');
    lease.release();
  });
  it('resuelve dos cajeros sin lector ni hardware y mantiene sus proveedores separados', async () => {
    const a = setup();
    const second = balanceTarget();
    second.terminalId = 'ATM20522';
    const secondProvider = {
      inspect: vi.fn(async () => ({
        ready: false,
        blockers: [{ id: 'QA-DEPENDENCY', label: 'Pendiente' }],
      })),
      acquire: vi.fn(async () => balanceLease(second)),
    };
    a.router.bind({
      ...a.binding,
      atmId: second.draft.atmId!,
      terminalId: second.terminalId,
      provider: secondProvider,
    });
    expect(await a.router.inspect(a.target)).toEqual({ ready: true, blockers: [] });
    expect((await a.router.inspect(second)).ready).toBe(false);
    const lease = await a.router.acquire(a.target, new AbortController().signal);
    expect(lease.cardReadId).toBe(a.target.cardReadId);
    expect(a.provider.acquire).toHaveBeenCalledOnce();
    expect(secondProvider.acquire).not.toHaveBeenCalled();
  });

  it('un ATM sin proveedor muestra integracion pendiente sin pedir hardware', async () => {
    const router = new QaBalanceContextRouter();
    const target = balanceTarget();
    expect(await router.inspect(target)).toMatchObject({
      ready: false,
      blockers: [{ id: 'QA-ATM-PROVIDER-NOT-BOUND' }],
    });
    await expect(router.acquire(target, new AbortController().signal)).rejects.toThrow(
      'QA_ATM_CONTEXT_UNAVAILABLE',
    );
  });

  it.each(['revision', 'terminal', 'endpoint', 'environment'])(
    'rechaza cambio de %s sin llamar al proveedor',
    async (changed) => {
      const { router, target, provider } = setup();
      if (changed === 'revision') target.draft.atmRevision = 2;
      if (changed === 'terminal') target.terminalId = 'ATM20522';
      if (changed === 'endpoint') target.endpoint.port++;
      if (changed === 'environment') target.draft.environment = 'PREPROD';
      expect((await router.inspect(target)).ready).toBe(false);
      await expect(router.acquire(target, new AbortController().signal)).rejects.toThrow();
      expect(provider.inspect).not.toHaveBeenCalled();
      expect(provider.acquire).not.toHaveBeenCalled();
    },
  );

  it('rechaza binding duplicado y copia el endpoint para evitar cambios externos', async () => {
    const { router, target, binding } = setup();
    expect(() => router.bind(binding)).toThrow('QA_ATM_BINDING_INVALID');
    binding.endpoint.port++;
    expect((await router.inspect(target)).ready).toBe(true);
  });

  it('borra y libera una entrega tardia cuando se cancela el contexto', async () => {
    const { router, target, provider } = setup();
    const abort = new AbortController();
    const lease = balanceLease(target);
    lease.release = vi.fn();
    vi.mocked(provider.acquire).mockImplementation(async () => {
      abort.abort();
      return lease;
    });
    await expect(router.acquire(target, abort.signal)).rejects.toThrow(
      'QA_ATM_CONTEXT_UNAVAILABLE',
    );
    expect(lease.release).toHaveBeenCalledOnce();
    expect(
      [...lease.privateFields.values()].every((field) => field.every((byte) => byte === 0)),
    ).toBe(true);
  });

  it('rechaza seguridad entregada para otra tarjeta aunque el ATM coincida', async () => {
    const { router, target, provider } = setup();
    const lease = balanceLease(balanceTarget());
    lease.release = vi.fn();
    vi.mocked(provider.acquire).mockResolvedValue(lease);
    await expect(router.acquire(target, new AbortController().signal)).rejects.toThrow();
    expect(lease.release).toHaveBeenCalledOnce();
  });
});
