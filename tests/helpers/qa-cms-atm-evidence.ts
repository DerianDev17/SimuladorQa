import { randomUUID } from 'node:crypto';
import { balanceTarget } from './balance-inquiry';
import type { QaCmsAtmEvidence } from '../../apps/desktop/src/main/infrastructure/qa-cms-atm-evidence';

export function cmsEvidenceFixture() {
  const target = balanceTarget();
  const row: QaCmsAtmEvidence = {
    id: randomUUID(),
    environment: 'QA',
    entityCode: '205',
    atmId: target.draft.atmId!,
    atmRevision: target.draft.atmRevision!,
    terminalId: target.terminalId,
    senderEndpoint: target.endpoint,
    tcsEndpoint: { host: '127.0.0.1', port: 6100 },
    sourceEndpoint: { host: '192.0.2.10', port: 30964 },
    imageId: 1054,
    componentIds: [101, 102],
    masterCheckMatched: true,
    hostKeyChangePending: true,
    verifiedAt: '2026-10-14T17:00:00.000Z',
  };
  return { target, row, input: { version: 1, bindings: [row] } };
}
