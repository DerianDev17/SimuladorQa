import { channels } from '../../../packages/shared/src/contracts';

// Only queries may share an IPC request. Commands keep their existing Main-side
// validation, locks and financial idempotency.
const readChannels = new Set<string>([
  channels.snapshot,
  channels.catalog,
  channels.reader,
  channels.switchConnection,
  channels.sendConfiguration,
  channels.listSavedCardProfiles,
  channels.balanceReadiness,
  channels.balanceExecution,
  channels.balanceHistory,
  channels.withdrawalReadiness,
  channels.withdrawalExecution,
  channels.withdrawalHistory,
  channels.depositReadiness,
  channels.depositExecution,
  channels.depositHistory,
  channels.sessionMessages,
  channels.inspectQaAtm,
  channels.observations,
  channels.mediatorLive,
  channels.loadRun,
  channels.loadConfigurations,
  channels.loadHistory,
  channels.loadHistoryDetail,
]);

function argumentsKey(args: readonly unknown[]): string | undefined {
  const ancestors = new Set<object>();
  function encode(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (typeof value !== 'object' || ancestors.has(value)) throw Error('Unsupported key');
    const prototype: unknown = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)
      throw Error('Unsupported key');
    if (Object.getOwnPropertySymbols(value).length) throw Error('Unsupported key');
    ancestors.add(value);
    try {
      return Array.isArray(value)
        ? `[${Array.from(value, encode).join(',')}]`
        : `{${Object.entries(value)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([key, item]) => `${JSON.stringify(key)}:${encode(item)}`)
            .join(',')}}`;
    } finally {
      ancestors.delete(value);
    }
  }
  try {
    return encode(args);
  } catch {
    // Malformed/non-JSON payloads still reach the existing IPC validation. Do
    // not normalize them into the key of a valid request.
    return undefined;
  }
}

export class IpcReadRequests {
  private readonly pending = new Map<string, Map<string, Promise<unknown>>>();

  invalidate(channel?: string): void {
    if (channel === undefined) this.pending.clear();
    else this.pending.delete(channel);
  }

  run<T>(channel: string, args: readonly unknown[], operation: () => Promise<T>): Promise<T> {
    if (!readChannels.has(channel)) {
      this.invalidate();
      return Promise.resolve()
        .then(operation)
        .finally(() => this.invalidate());
    }
    const key = argumentsKey(args);
    if (key === undefined) return Promise.resolve().then(operation);
    let requests = this.pending.get(channel);
    if (!requests) {
      requests = new Map();
      this.pending.set(channel, requests);
    }
    const existing = requests.get(key);
    // A channel and its exact arguments have one response type in DesktopApi.
    if (existing) return existing as Promise<T>;
    const current = requests;
    const request = Promise.resolve()
      .then(operation)
      .finally(() => {
        current.delete(key);
        if (!current.size && this.pending.get(channel) === current) this.pending.delete(channel);
      });
    current.set(key, request);
    return request;
  }
}
