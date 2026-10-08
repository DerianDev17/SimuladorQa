import { randomUUID } from 'node:crypto';
import { isIPv4, Socket } from 'node:net';
import type {
  QaNetworkProbePort,
  QaNetworkProbeRequest,
  QaNetworkProbeResult,
} from '../qa-network-probe-port';
import { CapturedVisaFraming } from '../infrastructure/captured-visa-framing';
import { VisaNetworkManagement } from './visa-network-management';

function integer(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max;
}

function admissionDenied(bytes: Buffer): boolean {
  const whitespace = [9, 10, 13, 32];
  let start = 0,
    end = bytes.length;
  while (start < end && whitespace.includes(bytes[start]!)) start++;
  while (end > start && whitespace.includes(bytes[end - 1]!)) end--;
  return ['NO AUTHORIZATION', 'NO CONFIGURATION', 'ACCESS DENIED'].some((text) =>
    bytes.subarray(start, end).equals(Buffer.from(text, 'ascii')),
  );
}

export class QaNetworkProbe implements QaNetworkProbePort {
  async observe(request: QaNetworkProbeRequest): Promise<QaNetworkProbeResult> {
    const result: QaNetworkProbeResult = {
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      finishedAt: '',
      outcome: 'BLOCKED',
      connected: false,
      bytesReceived: 0,
      writeAttempted: false,
      bytesWritten: 0,
      framingComplete: true,
      messages: [],
    };
    const block = (errorCode: 'QA_ONLY' | 'INVALID_INPUT') => {
      result.errorCode = errorCode;
      result.finishedAt = new Date().toISOString();
      return result;
    };
    if (request?.environment !== 'QA') return block('QA_ONLY');
    if (
      !request.endpoint ||
      typeof request.endpoint.host !== 'string' ||
      !isIPv4(request.endpoint.host) ||
      !integer(request.endpoint.port, 65535) ||
      !integer(request.deadlineMs, 30000)
    )
      return block('INVALID_INPUT');
    const endpoint = { ...request.endpoint };
    const decoder = new CapturedVisaFraming().decoder();
    const codec = new VisaNetworkManagement();
    const diagnostic = Buffer.alloc(4096);
    return new Promise((resolve) => {
      const socket = new Socket();
      let settled = false;
      const finish = (outcome: QaNetworkProbeResult['outcome']) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        try {
          decoder.finish();
        } catch {
          result.framingComplete = false;
        }
        diagnostic.fill(0);
        result.outcome = outcome;
        result.finishedAt = new Date().toISOString();
        resolve(result);
      };
      const timer = setTimeout(
        () => finish(result.connected ? 'OBSERVATION_ENDED' : 'CONNECT_TIMEOUT'),
        request.deadlineMs,
      );
      socket.once('connect', () => {
        if (settled) return;
        result.connected = true;
        if (socket.localAddress && socket.localPort)
          result.localEndpoint = { address: socket.localAddress, port: socket.localPort };
      });
      socket.on('data', (chunk: Buffer) => {
        if (settled) {
          chunk.fill(0);
          return;
        }
        const previous = result.bytesReceived;
        result.bytesReceived += chunk.length;
        if (result.bytesReceived > diagnostic.length) {
          chunk.fill(0);
          finish('RECEIVE_LIMIT');
          return;
        }
        chunk.copy(diagnostic, previous);
        if (admissionDenied(diagnostic.subarray(0, result.bytesReceived))) {
          chunk.fill(0);
          finish('ADMISSION_DENIED');
          return;
        }
        const frames = decoder.push(chunk);
        chunk.fill(0);
        if (!frames.length) return;
        let supported = true;
        for (const frame of frames) {
          try {
            result.messages.push(codec.inspect(frame.opaqueBody));
          } catch {
            supported = false;
          } finally {
            frame.opaqueBody.fill(0);
            frame.extension.fill(0);
          }
        }
        finish(supported ? 'NETWORK_MANAGEMENT_RECEIVED' : 'UNSUPPORTED_FRAME');
      });
      socket.once('error', (error: NodeJS.ErrnoException) => {
        if (settled) return;
        result.errorCode =
          error.code === 'ECONNREFUSED'
            ? 'REFUSED'
            : ['ENETUNREACH', 'EHOSTUNREACH'].includes(error.code ?? '')
              ? 'UNREACHABLE'
              : ['EACCES', 'EPERM'].includes(error.code ?? '')
                ? 'PERMISSION'
                : 'OTHER';
        finish('SOCKET_ERROR');
      });
      socket.once('close', () => finish('PEER_CLOSED'));
      try {
        socket.connect({ ...endpoint, family: 4 });
      } catch {
        result.errorCode = 'OTHER';
        finish('SOCKET_ERROR');
      }
    });
  }
}
