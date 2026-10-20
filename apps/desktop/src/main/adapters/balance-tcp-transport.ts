import { Socket, isIPv4 } from 'node:net';
import { performance } from 'node:perf_hooks';
import type {
  BalanceExchangeRequest,
  BalanceExchangeResult,
  BalanceTransport,
} from '../balance-ports';
import { CapturedVisaFraming } from '../infrastructure/captured-visa-framing';
import { CapturedVisaBalance } from './captured-visa-balance';
import { VisaNetworkManagement } from './visa-network-management';

// Single financial write. No automatic retries, reconnection, 0810 or reversals.
export class BalanceTcpTransport implements BalanceTransport {
  constructor(private readonly operation: 'BALANCE' | 'WITHDRAWAL' = 'BALANCE') {}
  async exchange(request: BalanceExchangeRequest): Promise<BalanceExchangeResult> {
    const started = performance.now();
    const empty = (): BalanceExchangeResult => ({
      outcome: 'TRANSPORT_ERROR',
      transmissionAttempted: false,
      bytesQueued: 0,
      elapsedMs: Math.round(performance.now() - started),
      responseCode: null,
      balances: [],
    });
    if (
      request.signal?.aborted ||
      request.environment !== 'QA' ||
      !isIPv4(request.endpoint.host) ||
      !Number.isInteger(request.endpoint.port) ||
      request.endpoint.port < 1 ||
      request.endpoint.port > 65535 ||
      ![request.connectDeadlineMs, request.responseDeadlineMs].every(
        (value) => Number.isInteger(value) && value >= 1 && value <= 30000,
      ) ||
      !(request.wire instanceof Uint8Array) ||
      !request.wire.length ||
      request.wire.length > 65535
    )
      return empty();
    const wire = Buffer.from(request.wire);
    const expected = structuredClone(request.expected);
    const decoder = new CapturedVisaFraming().decoder();
    const codec = new CapturedVisaBalance(this.operation);
    if (this.operation === 'WITHDRAWAL') {
      const check = new CapturedVisaFraming().decoder();
      let frames: ReturnType<typeof check.push> = [];
      try {
        frames = check.push(wire);
        check.finish();
        if (frames.length !== 1) throw Error('WITHDRAWAL_WIRE_INVALID');
        const actual = codec.inspect(frames[0]!.opaqueBody);
        if (
          actual.mti !== '0200' ||
          actual.processingCode !== '011000' ||
          ['stan', 'rrn', 'terminalId', 'currency', 'processingCode', 'amount'].some(
            (key) => actual[key as keyof typeof actual] !== expected[key as keyof typeof expected],
          )
        )
          throw Error('WITHDRAWAL_WIRE_INVALID');
      } catch {
        wire.fill(0);
        return empty();
      } finally {
        for (const frame of frames) {
          frame.opaqueBody.fill(0);
          frame.extension.fill(0);
        }
      }
    }
    const network = new VisaNetworkManagement();
    return new Promise((resolve) => {
      const socket = new Socket();
      let ended = false,
        attempted = false,
        received = 0,
        framesSeen = 0;
      let responseTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (
        outcome: BalanceExchangeResult['outcome'],
        responseCode: string | null = null,
        balances: BalanceExchangeResult['balances'] = [],
      ) => {
        if (ended) return;
        ended = true;
        clearTimeout(connectTimer);
        clearTimeout(responseTimer);
        const result = {
          ...empty(),
          outcome,
          transmissionAttempted: attempted,
          bytesQueued: socket.bytesWritten,
          responseCode,
          balances: structuredClone(balances),
        };
        request.signal?.removeEventListener('abort', cancel);
        socket.destroy();
        wire.fill(0);
        try {
          decoder.finish();
        } catch {
          /* Incomplete data is never exposed. */
        }
        resolve(result);
      };
      const cancel = () => finish('TRANSPORT_ERROR');
      const connectTimer = setTimeout(() => finish('CONNECT_TIMEOUT'), request.connectDeadlineMs);
      request.signal?.addEventListener('abort', cancel, { once: true });
      if (request.signal?.aborted) {
        cancel();
        return;
      }
      socket.once('connect', () => {
        if (ended) return;
        clearTimeout(connectTimer);
        responseTimer = setTimeout(() => finish('RESPONSE_TIMEOUT'), request.responseDeadlineMs);
        attempted = true;
        try {
          socket.write(wire, (error) => {
            if (error) finish('TRANSPORT_ERROR');
          });
        } catch {
          finish('TRANSPORT_ERROR');
        }
      });
      socket.on('data', (chunk: Buffer) => {
        if (ended) return;
        received += chunk.length;
        if (received > 65535) return finish('INVALID_RESPONSE');
        let frames: ReturnType<typeof decoder.push> = [];
        try {
          frames = decoder.push(chunk);
          for (const frame of frames) {
            if (ended) break;
            if (++framesSeen > 32) {
              finish('INVALID_RESPONSE');
              break;
            }
            const body = frame.opaqueBody;
            if (body.length < 24) {
              finish('INVALID_RESPONSE');
              break;
            }
            if (body.readUInt16BE(22) === 0x0800) {
              network.inspect(body);
              continue;
            }
            const metadata = codec.inspect(body);
            if (
              metadata.mti !== '0210' ||
              metadata.stan !== expected.stan ||
              metadata.rrn !== expected.rrn ||
              metadata.terminalId !== expected.terminalId ||
              metadata.processingCode !== expected.processingCode ||
              metadata.currency !== expected.currency
            )
              continue;
            const response = codec.response(body);
            if (this.operation === 'WITHDRAWAL') {
              // 91 is a completed host non-approval (MDT_StandardRetCode).
              // Partial/unknown responses and a mismatched approval need review.
              const approved =
                metadata.responseCode === '00' &&
                metadata.amount === expected.amount &&
                metadata.amount !== undefined;
              finish(
                approved
                  ? 'APPROVED'
                  : metadata.responseCode === '91'
                    ? 'NOT_APPROVED'
                    : 'REQUIRES_REVIEW',
                metadata.responseCode!,
                approved ? response.balances : [],
              );
              continue;
            }
            finish(
              metadata.responseCode === '00' ? 'APPROVED' : 'NOT_APPROVED',
              metadata.responseCode!,
              response.balances,
            );
          }
        } catch {
          finish('INVALID_RESPONSE');
        } finally {
          for (const frame of frames) {
            frame.opaqueBody.fill(0);
            frame.extension.fill(0);
          }
        }
      });
      socket.once('error', () => finish('TRANSPORT_ERROR'));
      socket.once('close', () => finish('PEER_CLOSED'));
      try {
        socket.connect({ ...request.endpoint, family: 4 });
      } catch {
        finish('TRANSPORT_ERROR');
      }
    });
  }
}
