import type {
  SwitchConnectionSnapshot,
  SwitchDisconnectReason,
} from '../../../../packages/domain/src/switch-connection';

export interface SwitchConnectionPort {
  snapshot(): SwitchConnectionSnapshot;
  connect(request: {
    environment: 'QA';
    endpoint: { host: string; port: number };
    connectDeadlineMs: number;
  }): void;
  disconnect(reason: SwitchDisconnectReason): void;
}
