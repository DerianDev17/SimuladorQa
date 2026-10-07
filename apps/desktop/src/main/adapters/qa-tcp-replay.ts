import { isIPv4, Socket } from 'node:net';
import type { QaReplayPort, QaReplayRequest, QaReplayResult } from '../qa-replay-port';

function validInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;
}
function blocked(errorCode: 'QA_ONLY' | 'INVALID_INPUT'): QaReplayResult {
  return {
    outcome: 'BLOCKED',
    writeAttempted: false,
    writeCompleted: false,
    bytesQueued: 0,
    bytesReceived: 0,
    errorCode,
  };
}
function socketCode(error: Error): QaReplayResult['errorCode'] {
  const code = 'code' in error ? error.code : undefined;
  if (code === 'ECONNREFUSED') return 'REFUSED';
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH') return 'UNREACHABLE';
  if (code === 'EACCES' || code === 'EPERM') return 'PERMISSION';
  return 'OTHER';
}

// Reproduce un bloque de bytes ya seleccionado; no genera ISO ni interpreta respuestas.
export class QaTcpReplay implements QaReplayPort {
  async sendOnce(request: QaReplayRequest): Promise<QaReplayResult> {
    if (request?.environment !== 'QA') return blocked('QA_ONLY');
    if (
      !request.endpoint ||
      typeof request.endpoint.host !== 'string' ||
      !isIPv4(request.endpoint.host) ||
      !validInteger(request.endpoint.port, 65535) ||
      !(request.wireBytes instanceof Uint8Array) ||
      !validInteger(request.wireBytes.byteLength, 65535) ||
      !validInteger(request.connectDeadlineMs, 30000) ||
      !validInteger(request.observationWindowMs, 30000)
    )
      return blocked('INVALID_INPUT');
    // Copia privada: modificaciones del consumidor no cambian el envio pendiente.
    const bytes = Buffer.from(request.wireBytes);
    const endpoint = { ...request.endpoint };
    const observationWindowMs = request.observationWindowMs;
    return new Promise((resolve) => {
      const socket = new Socket();
      let settled = false;
      let writeAttempted = false;
      let writeCompleted = false;
      let bytesReceived = 0;
      let observationTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (
        outcome: QaReplayResult['outcome'],
        errorCode?: QaReplayResult['errorCode'],
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        clearTimeout(observationTimer);
        const result: QaReplayResult = {
          outcome,
          writeAttempted,
          writeCompleted,
          bytesQueued: socket.bytesWritten,
          bytesReceived,
          ...(errorCode ? { errorCode } : {}),
        };
        socket.destroy();
        bytes.fill(0);
        resolve(result);
      };
      const connectTimer = setTimeout(() => finish('CONNECT_TIMEOUT'), request.connectDeadlineMs);
      socket.once('connect', () => {
        if (settled) return;
        clearTimeout(connectTimer);
        observationTimer = setTimeout(() => finish('OBSERVATION_ENDED'), observationWindowMs);
        writeAttempted = true;
        try {
          // Un unico write; sin retries, reconexion ni reverso automatico.
          socket.write(bytes, (error) => {
            if (settled) return;
            if (error) finish('WRITE_ERROR', socketCode(error));
            else writeCompleted = true;
          });
        } catch {
          finish('WRITE_ERROR', 'OTHER');
        }
      });
      socket.on('data', (chunk: Buffer) => {
        if (settled) return;
        bytesReceived += chunk.byteLength;
        // Solo conteo: nunca conservar/exponer respuestas potencialmente sensibles.
        if (bytesReceived > 65535) finish('RECEIVE_LIMIT');
      });
      socket.once('error', (error) => finish('SOCKET_ERROR', socketCode(error)));
      socket.once('close', () => finish('PEER_CLOSED'));
      try {
        socket.connect({ ...endpoint, family: 4 });
      } catch {
        finish('SOCKET_ERROR', 'OTHER');
      }
    });
  }
}
