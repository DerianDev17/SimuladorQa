import { randomUUID } from 'node:crypto';
import type { NetworkEvidence } from '../../packages/domain/src/network-evidence';

export function networkEvidence(): NetworkEvidence {
  return {
    version: 1,
    id: randomUUID(),
    recordedAt: '2026-10-07T15:00:00.000Z',
    environment: 'QA',
    ingress: { host: '10.0.0.11', port: 16100 },
    downstream: { host: '10.0.0.156', localPort: 49212, remotePort: 49212 },
    observedPeer: '10.0.0.171',
    simulatorOrigin: 'WORKSTATION',
    entityId: 205,
    networkInterface: {
      id: '80131',
      protocolLabel: 'TCP01',
      formatLabel: 'VISA',
      configuredHeaderLength: 2,
      initiator: 'REMOTE',
      keepAliveEnabled: true,
    },
  };
}
