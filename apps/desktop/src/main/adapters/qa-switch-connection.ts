import { randomUUID } from 'node:crypto';
import { isIPv4, Socket } from 'node:net';
import type {
  SwitchConnectionSnapshot,
  SwitchDisconnectReason,
} from '../../../../../packages/domain/src/switch-connection';
import type { SwitchConnectionPort } from '../switch-connection-port';
import type { BalanceTransport } from '../balance-ports';
import { CapturedVisaFraming } from '../infrastructure/captured-visa-framing';
import { VisaNetworkManagement } from './visa-network-management';

// Keep the socket after receiving network management. Never invent an 0810
// policy or treat a TCP connection as financial authorization.
export class QaSwitchConnection implements SwitchConnectionPort {
  private current: SwitchConnectionSnapshot = {
    environment: 'QA',
    connectionId: null,
    state: 'DISCONNECTED',
    endpoint: null,
    localEndpoint: null,
    connectedAt: null,
    disconnectedAt: null,
    observedAt: '',
    reason: null,
    bytesReceived: 0,
    networkMessage: null,
  };
  private finish: ((reason: SwitchDisconnectReason) => void) | undefined;
  private closed: Promise<void> = Promise.resolve();
  private lastRequest: Parameters<SwitchConnectionPort['connect']>[0] | undefined;
  private revision = 0;
  private transportActive = false;
  constructor(private readonly socketFactory: () => Socket = () => new Socket()) {}

  snapshot(): SwitchConnectionSnapshot {
    return structuredClone({ ...this.current, observedAt: new Date().toISOString() });
  }

  connect(request: Parameters<SwitchConnectionPort['connect']>[0]): void {
    if (this.transportActive) throw Error('QA_CONNECTION_BUSY');
    if (
      request?.environment !== 'QA' ||
      !request.endpoint ||
      typeof request.endpoint.host !== 'string' ||
      !isIPv4(request.endpoint.host) ||
      !Number.isInteger(request.endpoint.port) ||
      request.endpoint.port < 1 ||
      request.endpoint.port > 65535 ||
      !Number.isInteger(request.connectDeadlineMs) ||
      request.connectDeadlineMs < 1 ||
      request.connectDeadlineMs > 30000
    )
      throw Error('QA_CONNECTION_INVALID');
    if (this.current.state !== 'DISCONNECTED') {
      if (
        this.current.endpoint?.host === request.endpoint.host &&
        this.current.endpoint.port === request.endpoint.port
      )
        return;
      throw Error('QA_CONNECTION_BUSY');
    }
    const socket = this.socketFactory();
    this.revision++;
    this.lastRequest = structuredClone(request);
    this.closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    const decoder = new CapturedVisaFraming().decoder();
    const codec = new VisaNetworkManagement();
    const prefix = Buffer.alloc(64);
    let prefixUsed = 0,
      settled = false;
    this.current = {
      environment: 'QA',
      connectionId: randomUUID(),
      state: 'CONNECTING',
      endpoint: { ...request.endpoint },
      localEndpoint: null,
      connectedAt: null,
      disconnectedAt: null,
      observedAt: '',
      reason: null,
      bytesReceived: 0,
      networkMessage: null,
    };
    const finish = (reason: SwitchDisconnectReason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      try {
        decoder.finish();
      } catch {
        /* Partial bytes are discarded, never published. */
      }
      prefix.fill(0);
      this.current.state = 'DISCONNECTED';
      this.current.disconnectedAt = new Date().toISOString();
      this.current.reason = reason;
      this.finish = undefined;
    };
    const timer = setTimeout(() => finish('CONNECT_TIMEOUT'), request.connectDeadlineMs);
    this.finish = finish;
    socket.once('connect', () => {
      if (settled) return;
      clearTimeout(timer);
      this.current.state = 'CONNECTED';
      this.current.connectedAt = new Date().toISOString();
      if (socket.localAddress && socket.localPort)
        this.current.localEndpoint = { address: socket.localAddress, port: socket.localPort };
    });
    socket.on('data', (chunk: Buffer) => {
      try {
        if (settled) return;
        this.current.bytesReceived += chunk.length;
        // Cumulative observation cap; this connection never receives financial data intentionally.
        if (this.current.bytesReceived > 1024 * 1024) {
          finish('RECEIVE_LIMIT');
          return;
        }
        if (!this.current.networkMessage && prefixUsed < prefix.length) {
          prefixUsed += chunk.copy(prefix, prefixUsed, 0, prefix.length - prefixUsed);
          const text = prefix.toString('ascii', 0, prefixUsed).trim();
          if (['NO AUTHORIZATION', 'NO CONFIGURATION', 'ACCESS DENIED'].includes(text)) {
            finish('ADMISSION_DENIED');
            return;
          }
        }
        const frames = decoder.push(chunk);
        let supported = true;
        for (const frame of frames) {
          try {
            const message = codec.inspect(frame.opaqueBody);
            this.current.networkMessage = {
              mti: message.mti,
              code: message.networkCode,
              receivedAt: new Date().toISOString(),
            };
            prefix.fill(0);
            prefixUsed = prefix.length;
          } catch {
            supported = false;
          } finally {
            frame.extension.fill(0);
            frame.opaqueBody.fill(0);
          }
        }
        if (!supported) finish('UNSUPPORTED_FRAME');
      } catch {
        finish('UNSUPPORTED_FRAME');
      } finally {
        chunk.fill(0);
      }
    });
    socket.once('error', (error: NodeJS.ErrnoException) =>
      finish(
        error.code === 'ECONNREFUSED'
          ? 'REFUSED'
          : ['ENETUNREACH', 'EHOSTUNREACH'].includes(error.code ?? '')
            ? 'UNREACHABLE'
            : ['EACCES', 'EPERM'].includes(error.code ?? '')
              ? 'PERMISSION'
              : 'SOCKET_ERROR',
      ),
    );
    socket.once('close', () => finish('PEER_CLOSED'));
    try {
      socket.connect({ ...request.endpoint, family: 4 });
    } catch {
      finish('SOCKET_ERROR');
    }
  }

  disconnect(reason: SwitchDisconnectReason): void {
    this.revision++;
    if (this.finish) this.finish(reason);
    else if (this.current.state === 'DISCONNECTED') this.current.reason = reason;
  }

  manageTransport(transport: BalanceTransport): BalanceTransport {
    return {
      // Preserve capabilities when coordinating observation and financial sockets.
      ...(transport.supportsReversal ? { supportsReversal: true as const } : {}),
      exchange: (request) =>
        this.withTransaction(request.endpoint, () => transport.exchange(request)),
    };
  }

  async withTransaction<T>(
    endpoint: { host: string; port: number },
    exchange: () => Promise<T>,
  ): Promise<T> {
    if (this.transportActive) throw Error('QA_CONNECTION_BUSY');
    const resume =
      this.current.state !== 'DISCONNECTED' &&
      this.lastRequest?.endpoint.host === endpoint.host &&
      this.lastRequest.endpoint.port === endpoint.port
        ? structuredClone(this.lastRequest)
        : undefined;
    this.transportActive = true;
    this.disconnect('TRANSACTION_STARTED');
    const revision = this.revision;
    try {
      // Release the observation socket before opening the financial connection.
      await this.closed;
      return await exchange();
    } finally {
      this.transportActive = false;
      // Restore only the observation explicitly opened by the operator, once.
      // Never repeat the financial request or override a subsequent disconnect.
      if (resume && revision === this.revision) {
        try {
          this.connect(resume);
        } catch {
          this.current.reason = 'SOCKET_ERROR';
        }
      } else if (revision === this.revision && this.current.reason === 'TRANSACTION_STARTED') {
        this.current.reason = null;
      }
    }
  }
}
