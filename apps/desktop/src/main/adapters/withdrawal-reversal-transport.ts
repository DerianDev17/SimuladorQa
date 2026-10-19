import { Socket, isIPv4 } from 'node:net';
import { performance } from 'node:perf_hooks';
import type {
  BalanceExchangeRequest,
  BalanceExchangeResult,
  BalanceTransport,
} from '../balance-ports';
import type { ReversalProgress } from '../../../../../packages/domain/src/withdrawal-reversal';
import { isReversalDelay } from '../../../../../packages/domain/src/withdrawal-reversal';
import { CapturedVisaFraming } from '../infrastructure/captured-visa-framing';
import { CapturedVisaBalance } from './captured-visa-balance';
import { BalanceTcpTransport } from './balance-tcp-transport';
import { QaVisaReversal } from './qa-visa-reversal';
import { VisaNetworkManagement } from './visa-network-management';

// One connection, exactly one 0200 and at most one 0420. No retries/reconnects.
export class WithdrawalReversalTransport implements BalanceTransport {
  readonly supportsReversal = true;
  async exchange(request: BalanceExchangeRequest): Promise<BalanceExchangeResult> {
    if (!request.reversal) return new BalanceTcpTransport('WITHDRAWAL').exchange(request);
    const started = performance.now();
    const empty = (): BalanceExchangeResult => ({
      outcome: 'TRANSPORT_ERROR',
      transmissionAttempted: false,
      bytesQueued: 0,
      elapsedMs: Math.round(performance.now() - started),
      responseCode: null,
      balances: [],
    });
    const progress: ReversalProgress = {
      outcome: 'WAITING_WITHDRAWAL',
      dueAt: null,
      finishedAt: null,
      responseCode: null,
      transmissionAttempted: false,
      bytesQueued: 0,
    };
    const unsent = () => ({
      ...empty(),
      reversal: { ...progress, outcome: 'NOT_SENT' as const, finishedAt: new Date().toISOString() },
    });
    if (
      request.environment !== 'QA' ||
      !isReversalDelay(request.reversal.delaySeconds) ||
      typeof request.reversal.persist !== 'function' ||
      !isIPv4(request.endpoint.host) ||
      !Number.isInteger(request.endpoint.port) ||
      request.endpoint.port < 1 ||
      request.endpoint.port > 65535 ||
      ![request.connectDeadlineMs, request.responseDeadlineMs].every(
        (n) => Number.isInteger(n) && n >= 1 && n <= 30000,
      ) ||
      !(request.wire instanceof Uint8Array) ||
      !request.wire.length ||
      request.wire.length > 65535
    )
      return unsent();
    let reversal: QaVisaReversal;
    const codec = new CapturedVisaBalance('WITHDRAWAL');
    const check = new CapturedVisaFraming().decoder();
    let originals: ReturnType<typeof check.push> = [];
    try {
      originals = check.push(request.wire);
      check.finish();
      if (originals.length !== 1) throw Error('REVERSAL_ORIGINAL_INVALID');
      const actual = codec.inspect(originals[0]!.opaqueBody);
      if (
        actual.mti !== '0200' ||
        ['stan', 'rrn', 'terminalId', 'currency', 'processingCode', 'amount'].some(
          (key) =>
            actual[key as keyof typeof actual] !== request.expected[key as keyof typeof actual],
        )
      )
        throw Error('REVERSAL_ORIGINAL_INVALID');
      // Fail before the withdrawal when the paired reversal cannot be constructed.
      reversal = new QaVisaReversal(request.wire);
    } catch {
      return unsent();
    } finally {
      for (const f of originals) {
        f.opaqueBody.fill(0);
        f.extension.fill(0);
      }
    }
    const wire = Buffer.from(request.wire);
    const expected = structuredClone(request.expected);
    const decoder = new CapturedVisaFraming().decoder();
    const network = new VisaNetworkManagement();
    const plan = request.reversal;
    return new Promise((resolve) => {
      const socket = new Socket();
      let ended = false,
        attempted = false,
        received = 0,
        framesSeen = 0;
      let phase: 'WITHDRAWAL' | 'WAITING' | 'REVERSAL' = 'WITHDRAWAL';
      let original: BalanceExchangeResult | undefined;
      let approvedBody: Buffer | undefined, reversalWire: Buffer | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let persistence: Promise<void> = Promise.resolve();
      const finish = (
        outcome: BalanceExchangeResult['outcome'],
        code: string | null = null,
        balances: BalanceExchangeResult['balances'] = [],
      ) => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        const withdrawal = original ?? {
          ...empty(),
          outcome,
          responseCode: code,
          balances: structuredClone(balances),
          transmissionAttempted: attempted,
          bytesQueued: attempted ? Math.min(socket.bytesWritten, wire.length) : 0,
        };
        if (!['APPROVED', 'NOT_APPROVED'].includes(progress.outcome)) {
          progress.outcome = progress.transmissionAttempted ? 'UNCONFIRMED' : 'NOT_SENT';
          progress.finishedAt = new Date().toISOString();
        }
        if (progress.transmissionAttempted)
          progress.bytesQueued = Math.max(0, socket.bytesWritten - wire.length);
        socket.destroy();
        wire.fill(0);
        approvedBody?.fill(0);
        reversalWire?.fill(0);
        reversal.dispose();
        try {
          decoder.finish();
        } catch {
          /* No incomplete bytes escape Main. */
        }
        const result = { ...withdrawal, reversal: { ...progress } };
        void persistence.catch(() => undefined).then(() => resolve(result));
      };
      const sendReversal = async () => {
        if (ended || phase !== 'WAITING') return;
        try {
          reversalWire = reversal.build(approvedBody!);
          approvedBody!.fill(0);
          approvedBody = undefined;
          progress.outcome = 'SENDING';
          progress.transmissionAttempted = true; // durable intent before write
          persistence = plan.persist({ ...progress }, original!);
          await persistence;
          if (ended) return;
          phase = 'REVERSAL';
          timer = setTimeout(() => finish('RESPONSE_TIMEOUT'), request.responseDeadlineMs);
          socket.write(reversalWire, (error) => {
            if (error) finish('TRANSPORT_ERROR');
          });
        } catch {
          if (phase !== 'REVERSAL') progress.transmissionAttempted = false;
          finish('TRANSPORT_ERROR');
        }
      };
      const schedule = async () => {
        try {
          progress.outcome = 'WAITING';
          progress.dueAt = new Date(Date.now() + plan.delaySeconds * 1000).toISOString();
          persistence = plan.persist({ ...progress }, original!);
          await persistence;
          if (ended) return;
          timer = setTimeout(
            () => {
              void sendReversal();
            },
            Math.max(0, Date.parse(progress.dueAt!) - Date.now()),
          );
        } catch {
          finish('TRANSPORT_ERROR');
        }
      };
      timer = setTimeout(() => finish('CONNECT_TIMEOUT'), request.connectDeadlineMs);
      socket.once('connect', () => {
        if (ended) return;
        clearTimeout(timer);
        timer = setTimeout(() => finish('RESPONSE_TIMEOUT'), request.responseDeadlineMs);
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
        if (received > 131070) return finish('INVALID_RESPONSE');
        let frames: ReturnType<typeof decoder.push> = [];
        try {
          frames = decoder.push(chunk);
          for (const frame of frames) {
            if (ended) break;
            if (++framesSeen > 64) throw Error('FRAME_LIMIT');
            const body = frame.opaqueBody;
            if (body.length < 24) throw Error('FRAME_INVALID');
            const mti = body.readUInt16BE(22);
            if (mti === 0x0800) {
              network.inspect(body);
              continue;
            }
            if (phase === 'REVERSAL' && mti === 0x0430) {
              const code = reversal.response(body);
              if (code === undefined) continue;
              progress.responseCode = code;
              progress.outcome = code === '00' ? 'APPROVED' : 'NOT_APPROVED';
              progress.finishedAt = new Date().toISOString();
              finish('APPROVED');
              continue;
            }
            // Duplicate/late financial replies never restart the timer or send.
            if (mti !== 0x0210 || phase !== 'WITHDRAWAL') continue;
            const metadata = codec.inspect(body);
            if (
              ['stan', 'rrn', 'terminalId', 'currency', 'processingCode'].some(
                (key) =>
                  metadata[key as keyof typeof metadata] !== expected[key as keyof typeof metadata],
              )
            )
              continue;
            const response = codec.response(body);
            if (metadata.responseCode !== '00' || metadata.amount !== expected.amount) {
              finish(
                metadata.responseCode === '91' ? 'NOT_APPROVED' : 'REQUIRES_REVIEW',
                metadata.responseCode!,
              );
              continue;
            }
            clearTimeout(timer);
            original = {
              ...empty(),
              outcome: 'APPROVED',
              transmissionAttempted: true,
              bytesQueued: wire.length,
              responseCode: '00',
              balances: structuredClone(response.balances),
            };
            approvedBody = Buffer.from(body);
            phase = 'WAITING';
            // Validate F38 and full correlation before exposing a countdown.
            const preview = reversal.build(approvedBody);
            preview.fill(0);
            void schedule();
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
