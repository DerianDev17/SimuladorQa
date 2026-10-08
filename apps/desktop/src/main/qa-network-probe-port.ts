import type { Environment } from '../../../../packages/domain/src/index';

export interface VisaNetworkRequestMetadata {
  mti: '0800';
  networkCode: '071' | '072';
  stan: string;
  bodyBytes: 56;
  fields: readonly number[];
}

export interface QaNetworkProbeRequest {
  environment: Environment;
  endpoint: { host: string; port: number };
  deadlineMs: number;
}

export interface QaNetworkProbeResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  outcome:
    | 'BLOCKED'
    | 'CONNECT_TIMEOUT'
    | 'OBSERVATION_ENDED'
    | 'SOCKET_ERROR'
    | 'PEER_CLOSED'
    | 'ADMISSION_DENIED'
    | 'RECEIVE_LIMIT'
    | 'UNSUPPORTED_FRAME'
    | 'NETWORK_MANAGEMENT_RECEIVED';
  connected: boolean;
  localEndpoint?: { address: string; port: number };
  bytesReceived: number;
  writeAttempted: false;
  bytesWritten: 0;
  framingComplete: boolean;
  messages: VisaNetworkRequestMetadata[];
  errorCode?: 'QA_ONLY' | 'INVALID_INPUT' | 'REFUSED' | 'UNREACHABLE' | 'PERMISSION' | 'OTHER';
}

// Internal Main/tooling diagnostic. No application writes or session-readiness verdict.
export interface QaNetworkProbePort {
  observe(request: QaNetworkProbeRequest): Promise<QaNetworkProbeResult>;
}
