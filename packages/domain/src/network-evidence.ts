import type { Environment } from './index';

// Evidencia documental de una red; no es configuración ejecutable de transporte.
export interface NetworkEvidence {
  version: 1;
  id: string;
  recordedAt: string;
  environment: Environment;
  ingress: { host: string; port: number };
  downstream: { host: string; localPort: number; remotePort: number };
  observedPeer: string;
  simulatorOrigin: 'WORKSTATION' | 'ATM_SERVER';
  entityId: number;
  networkInterface: {
    id: string;
    protocolLabel: string;
    formatLabel: string;
    configuredHeaderLength: number;
    initiator: 'REMOTE' | 'LOCAL';
    keepAliveEnabled: boolean;
  };
}

export type NetworkEvidenceSnapshot =
  | { status: 'DOCUMENTED'; evidence: NetworkEvidence }
  | { status: 'NOT_CONFIGURED' | 'UNAVAILABLE' };

export interface NetworkEvidenceCatalog {
  forEnvironment(environment: Environment): NetworkEvidenceSnapshot;
}

function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function ipv4(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every(
      (part) => /^\d{1,3}$/.test(part) && Number(part) <= 255 && String(Number(part)) === part,
    )
  );
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
  );
}
function label(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Z][A-Z0-9_-]{0,15}$/.test(value) && !/\d{12}/.test(value)
  );
}

export function parseNetworkEvidence(value: unknown): NetworkEvidence | undefined {
  if (
    !record(value, [
      'version',
      'id',
      'recordedAt',
      'environment',
      'ingress',
      'downstream',
      'observedPeer',
      'simulatorOrigin',
      'entityId',
      'networkInterface',
    ])
  )
    return undefined;
  if (
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)
  )
    return undefined;
  if (
    typeof value.recordedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.recordedAt)
  )
    return undefined;
  const timestamp = new Date(value.recordedAt);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== value.recordedAt)
    return undefined;
  if (value.environment !== 'QA' && value.environment !== 'PREPROD') return undefined;
  if (
    !record(value.ingress, ['host', 'port']) ||
    !ipv4(value.ingress.host) ||
    !integer(value.ingress.port, 1, 65535)
  )
    return undefined;
  if (
    !record(value.downstream, ['host', 'localPort', 'remotePort']) ||
    !ipv4(value.downstream.host) ||
    !integer(value.downstream.localPort, 1, 65535) ||
    !integer(value.downstream.remotePort, 1, 65535)
  )
    return undefined;
  if (
    !ipv4(value.observedPeer) ||
    (value.simulatorOrigin !== 'WORKSTATION' && value.simulatorOrigin !== 'ATM_SERVER') ||
    !integer(value.entityId, 0, 32767)
  )
    return undefined;
  const networkInterface = value.networkInterface;
  if (
    !record(networkInterface, [
      'id',
      'protocolLabel',
      'formatLabel',
      'configuredHeaderLength',
      'initiator',
      'keepAliveEnabled',
    ]) ||
    typeof networkInterface.id !== 'string' ||
    !/^\d{1,10}$/.test(networkInterface.id) ||
    !label(networkInterface.protocolLabel) ||
    !label(networkInterface.formatLabel) ||
    !integer(networkInterface.configuredHeaderLength, 0, 255) ||
    (networkInterface.initiator !== 'REMOTE' && networkInterface.initiator !== 'LOCAL') ||
    typeof networkInterface.keepAliveEnabled !== 'boolean'
  )
    return undefined;
  return {
    version: 1,
    id: value.id,
    recordedAt: value.recordedAt,
    environment: value.environment,
    ingress: { host: value.ingress.host, port: value.ingress.port },
    downstream: {
      host: value.downstream.host,
      localPort: value.downstream.localPort,
      remotePort: value.downstream.remotePort,
    },
    observedPeer: value.observedPeer,
    simulatorOrigin: value.simulatorOrigin,
    entityId: value.entityId,
    networkInterface: {
      id: networkInterface.id,
      protocolLabel: networkInterface.protocolLabel,
      formatLabel: networkInterface.formatLabel,
      configuredHeaderLength: networkInterface.configuredHeaderLength,
      initiator: networkInterface.initiator,
      keepAliveEnabled: networkInterface.keepAliveEnabled,
    },
  };
}
