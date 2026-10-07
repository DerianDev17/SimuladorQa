import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CapturedEvidenceCatalog } from '../../apps/desktop/src/main/adapters/captured-evidence-catalog';
import {
  CapturedBanredEnvelope,
  capturedMtis,
} from '../../apps/desktop/src/main/adapters/captured-banred-envelope';
import { InclusiveBe16Framing } from '../../apps/desktop/src/main/infrastructure/inclusive-be16-framing';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import { syntheticEnvelope } from '../helpers/synthetic-envelope';

describe('evidencia y pipeline de encapsulado offline', () => {
  it('reconstruye una secuencia de familias capturadas con fragmentación arbitraria', () => {
    const framing = new InclusiveBe16Framing();
    const codec = new CapturedBanredEnvelope();
    const bodies = capturedMtis.map((mti) => syntheticEnvelope(mti));
    const stream = Buffer.concat(bodies.map((body) => framing.encode(body)));
    for (const chunkSize of [1, 2, 7, 37, 512]) {
      const decoder = framing.decoder();
      const rebuilt = [];
      for (let cursor = 0; cursor < stream.length; cursor += chunkSize) {
        for (const body of decoder.push(stream.subarray(cursor, cursor + chunkSize))) {
          const parsed = codec.decode(body);
          rebuilt.push(
            framing.encode(
              codec.encode(
                parsed.metadata.header,
                parsed.metadata.mti,
                parsed.bitmap,
                parsed.opaqueData,
              ),
            ),
          );
        }
      }
      decoder.finish();
      expect(Buffer.concat(rebuilt)).toEqual(stream);
    }
  });
  it('distingue fin de fuente incompleta de una envolvente no soportada', () => {
    const framing = new InclusiveBe16Framing();
    const decoder = framing.decoder();
    decoder.push(framing.encode(syntheticEnvelope()).subarray(0, 20));
    expect(() => decoder.finish()).toThrow('FRAME_INCOMPLETE');
    const invalid = framing.decoder().push(framing.encode(Buffer.from('unsupported')));
    expect(() => new CapturedBanredEnvelope().decode(invalid[0]!)).toThrow('ENVELOPE_INVALID');
  });
  it('publica solo metadatos de las diez capturas y conserva bloqueo en QA/PREPROD', async () => {
    const application = new DesktopApplication(
      {
        read: async () => ({ version: 1, environment: 'QA', audit: [] }),
        write: async () => undefined,
      },
      {
        agentId: randomUUID(),
        hostname: 'test',
        user: 'test',
        version: '0.1.0',
        uuid: randomUUID,
        now: () => '2026-10-07T03:00:00.000Z',
      },
      undefined,
      undefined,
      undefined,
      new CapturedEvidenceCatalog(),
    );
    const result = await application.getSnapshot();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('SNAPSHOT_FAILED');
    const report = result.value.captureEvidence!;
    expect(report.environment).toBe('UNCONFIRMED');
    expect(report.captures).toHaveLength(10);
    expect(report.captures.reduce((sum, capture) => sum + capture.messages, 0)).toBe(218);
    expect(report.captures.filter((capture) => capture.messages > 0)).toHaveLength(4);
    expect(report.profile.lengthIncludesPrefix).toBe(true);
    expect(report.profile.minimumObservedBytes).toBe(69);
    expect(report.profile.maximumObservedBytes).toBe(664);
    for (const capture of report.captures) {
      expect(capture.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(capture.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(Object.keys(capture).sort()).toEqual(
        [
          'id',
          'file',
          'sha256',
          'bytes',
          'inspectedDirections',
          'unsupportedDirections',
          'conflictingDirections',
          'incompleteDirections',
          'messages',
          'mtiCounts',
        ].sort(),
      );
    }
    expect(result.value.connection).toBe('NOT_CONFIGURED');
    for (const transaction of [
      'BALANCE',
      'WITHDRAWAL_APPROVED',
      'WITHDRAWAL_DECLINED',
      'REVERSAL',
      'TIMEOUT_REVERSAL',
    ])
      expect(await application.prepare({ transaction, scenario: 'BANRED' })).toMatchObject({
        ok: true,
        value: { status: 'BLOCKED' },
      });
  });
  it('funciona sin dependencia de capturas y sin abrir archivos privados', async () => {
    const application = new DesktopApplication(
      {
        read: async () => ({ version: 1, environment: 'PREPROD', audit: [] }),
        write: async () => undefined,
      },
      {
        agentId: randomUUID(),
        hostname: 'test',
        user: 'test',
        version: '0.1.0',
        uuid: randomUUID,
        now: () => '2026-10-07T03:00:00.000Z',
      },
    );
    expect(await application.getSnapshot()).toMatchObject({
      ok: true,
      value: { captureEvidence: null, connection: 'NOT_CONFIGURED' },
    });
  });
});
