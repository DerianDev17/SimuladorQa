import { isUuid, isRevision } from '../../../../packages/domain/src/catalogs';
import { isIPv4 } from 'node:net';
import type { BalanceReadiness } from '../../../../packages/domain/src/balance-inquiry';
import type { BalanceContextLease, BalanceContextProvider, BalanceTarget } from './balance-ports';

// Main-only bindings. An ATM profile identifies a simulated terminal; it does
// not assert that an ATM or a reader is physically attached to this station.
export interface QaAtmContextBinding {
  atmId: string;
  atmRevision: number;
  terminalId: string;
  endpoint: { host: string; port: number };
  provider: BalanceContextProvider;
}

const unavailable = (): BalanceReadiness => ({
  ready: false,
  blockers: [
    {
      id: 'QA-ATM-PROVIDER-NOT-BOUND',
      label:
        'Esta instancia no tiene un perfil de ejecución QA aprobado cargado; revisa la vinculación del ATM y reinicia la app',
    },
  ],
});

export class QaBalanceContextRouter implements BalanceContextProvider {
  private readonly bindings = new Map<string, QaAtmContextBinding>();
  constructor(private readonly operation: 'BALANCE' | 'WITHDRAWAL' = 'BALANCE') {}

  // Registration stays inside Main. Renderer cannot supply executable adapters,
  // endpoints, financial bytes or a claim that a virtual card has fresh security.
  bind(binding: QaAtmContextBinding): void {
    if (
      !isUuid(binding.atmId) ||
      !isRevision(binding.atmRevision) ||
      !/^[A-Z0-9]{8}$/.test(binding.terminalId) ||
      !isIPv4(binding.endpoint.host) ||
      !Number.isInteger(binding.endpoint.port) ||
      binding.endpoint.port < 1 ||
      binding.endpoint.port > 65535 ||
      typeof binding.provider?.inspect !== 'function' ||
      typeof binding.provider.acquire !== 'function' ||
      this.bindings.has(binding.atmId)
    )
      throw Error('QA_ATM_BINDING_INVALID');
    this.bindings.set(binding.atmId, {
      ...binding,
      endpoint: { ...binding.endpoint },
    });
  }

  private resolve(target: BalanceTarget): QaAtmContextBinding | undefined {
    if (
      target.draft.environment !== 'QA' ||
      (this.operation === 'BALANCE'
        ? target.draft.transaction !== 'BALANCE'
        : !['WITHDRAWAL_APPROVED', 'WITHDRAWAL_DECLINED'].includes(target.draft.transaction)) ||
      target.draft.account !== 'SAVINGS' ||
      !isUuid(target.cardReadId) ||
      !isUuid(target.draft.atmId)
    )
      return undefined;
    const binding = this.bindings.get(target.draft.atmId);
    return binding &&
      binding.atmRevision === target.draft.atmRevision &&
      binding.terminalId === target.terminalId &&
      binding.endpoint.host === target.endpoint.host &&
      binding.endpoint.port === target.endpoint.port
      ? binding
      : undefined;
  }

  async inspect(target: BalanceTarget): Promise<BalanceReadiness> {
    const binding = this.resolve(target);
    return binding ? binding.provider.inspect(structuredClone(target)) : unavailable();
  }

  async acquire(target: BalanceTarget, signal: AbortSignal): Promise<BalanceContextLease> {
    const binding = this.resolve(target);
    if (!binding || signal.aborted) throw Error('QA_ATM_CONTEXT_UNAVAILABLE');
    const lease = await binding.provider.acquire(structuredClone(target), signal);
    if (
      signal.aborted ||
      lease.environment !== 'QA' ||
      lease.cardReadId !== target.cardReadId ||
      lease.terminalId !== binding.terminalId ||
      lease.endpoint.host !== binding.endpoint.host ||
      lease.endpoint.port !== binding.endpoint.port ||
      lease.securitySource !== 'GENERATED_TEST_SESSION' ||
      (this.operation === 'WITHDRAWAL'
        ? lease.amount !== target.draft.amount
        : lease.amount !== undefined)
    ) {
      lease.header.fill(0);
      lease.extension.fill(0);
      for (const field of lease.privateFields.values()) field.fill(0);
      try {
        lease.release();
      } catch {
        // Never surface a provider's raw errors or security values.
      }
      throw Error('QA_ATM_CONTEXT_UNAVAILABLE');
    }
    return lease;
  }
}
