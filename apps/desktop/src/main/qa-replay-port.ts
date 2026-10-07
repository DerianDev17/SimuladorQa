import type { Environment } from '../../../../packages/domain/src/index';

// Puerto interno de Main/herramientas QA. Estos bytes nunca se publican por IPC.
export interface QaReplayRequest {
  environment: Environment;
  endpoint: { host: string; port: number };
  wireBytes: Uint8Array;
  connectDeadlineMs: number;
  observationWindowMs: number;
}

export interface QaReplayResult {
  outcome:
    | 'BLOCKED'
    | 'CONNECT_TIMEOUT'
    | 'SOCKET_ERROR'
    | 'WRITE_ERROR'
    | 'OBSERVATION_ENDED'
    | 'PEER_CLOSED'
    | 'RECEIVE_LIMIT';
  writeAttempted: boolean;
  writeCompleted: boolean;
  bytesQueued: number;
  bytesReceived: number;
  errorCode?: 'QA_ONLY' | 'INVALID_INPUT' | 'REFUSED' | 'UNREACHABLE' | 'PERMISSION' | 'OTHER';
}

export interface QaReplayPort {
  sendOnce(request: QaReplayRequest): Promise<QaReplayResult>;
}
