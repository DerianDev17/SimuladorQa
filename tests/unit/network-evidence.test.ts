import { describe, expect, it } from 'vitest';
import { parseNetworkEvidence } from '../../packages/domain/src/network-evidence';
import { networkEvidence } from '../helpers/network-evidence';

describe('evidencia documental de red', () => {
  it('valida y copia una topología sin habilitar transporte', () => {
    const source = networkEvidence();
    const parsed = parseNetworkEvidence(source);
    expect(parsed).toEqual(source);
    source.ingress.host = '10.0.0.200';
    source.networkInterface.id = '123';
    expect(parsed?.ingress.host).toBe('10.0.0.11');
    expect(parsed?.networkInterface.id).toBe('80131');
  });
  it.each([
    { environment: 'PROD' },
    { version: 2 },
    { id: '80131' },
    { recordedAt: '2026-02-30T12:00:00.000Z' },
    { recordedAt: '2026-10-07T15:00:00-05:00' },
    { ingress: { host: '256.0.0.1', port: 16100 } },
    { ingress: { host: '10.00.0.11', port: 16100 } },
    { ingress: { host: 'https://10.0.0.11', port: 16100 } },
    { ingress: { host: '10.0.0.11', port: 0 } },
    { ingress: { host: '10.0.0.11', port: 65536 } },
    { downstream: { host: '10.0.0.156', localPort: '49212', remotePort: 49212 } },
    { observedPeer: 'private-secret' },
    { simulatorOrigin: 'ANY' },
    { entityId: 32768 },
    { password: 'private-secret' },
  ])('rechaza entradas inválidas %j', (patch) =>
    expect(parseNetworkEvidence({ ...networkEvidence(), ...patch })).toBeUndefined(),
  );
  it('rechaza propiedades anidadas, PAN y etiquetas/cabeceras no válidas', () => {
    const evidence = networkEvidence();
    for (const patch of [
      { credentials: 'private-secret' },
      { id: '4'.repeat(16) },
      { formatLabel: '<script>' },
      { protocolLabel: 'A' + '4'.repeat(12) },
      { configuredHeaderLength: -1 },
      { initiator: 'ANY' },
      { keepAliveEnabled: 1 },
    ]) {
      expect(
        parseNetworkEvidence({
          ...evidence,
          networkInterface: { ...evidence.networkInterface, ...patch },
        }),
      ).toBeUndefined();
    }
    expect(
      parseNetworkEvidence({
        ...evidence,
        ingress: { ...evidence.ingress, credentials: 'private-secret' },
      }),
    ).toBeUndefined();
  });
});
