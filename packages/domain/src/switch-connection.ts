export type SwitchDisconnectReason =
  | 'USER_DISCONNECTED'
  | 'ENVIRONMENT_CHANGED'
  | 'APP_CLOSED'
  | 'TRANSACTION_STARTED'
  | 'PEER_CLOSED'
  | 'CONNECT_TIMEOUT'
  | 'REFUSED'
  | 'UNREACHABLE'
  | 'PERMISSION'
  | 'SOCKET_ERROR'
  | 'ADMISSION_DENIED'
  | 'UNSUPPORTED_FRAME'
  | 'RECEIVE_LIMIT';

// Technical TCP state only. No PIN, card data, raw frames or financial readiness.
export interface SwitchConnectionSnapshot {
  environment: 'QA';
  connectionId: string | null;
  state: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';
  endpoint: { host: string; port: number } | null;
  localEndpoint: { address: string; port: number } | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  observedAt: string;
  reason: SwitchDisconnectReason | null;
  bytesReceived: number;
  networkMessage: { mti: '0800'; code: '071' | '072'; receivedAt: string } | null;
}
