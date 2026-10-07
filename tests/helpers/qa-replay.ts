import type { QaReplayRequest } from '../../apps/desktop/src/main/qa-replay-port';

export function qaReplayRequest(port = 16100): QaReplayRequest {
  return {
    environment: 'QA',
    endpoint: { host: '127.0.0.1', port },
    wireBytes: Uint8Array.of(1, 2, 3, 4), // Bytes sinteticos, no trama financiera.
    connectDeadlineMs: 1000,
    observationWindowMs: 100,
  };
}
