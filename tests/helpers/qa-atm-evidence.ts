import { randomUUID } from 'node:crypto';
import { balanceTarget } from './balance-inquiry';

export function evidenceFixture() {
  const target = balanceTarget();
  const row = {
    id: randomUUID(),
    environment: 'QA',
    entityCode: '205',
    atmId: target.draft.atmId!,
    atmRevision: 1,
    terminalId: target.terminalId,
    endpoint: target.endpoint,
    atmPid: '80131',
    corePid: '82052',
    coreEndpoint: { host: '127.0.0.1', port: 49212 },
    pinBlockFormatCode: '01',
    keyCheckValue: 'ABCDEF',
    keyLengthSetting: 32,
    ppkIndex: 1,
    sameReportedKeyBlock: true,
    sourceReference: 'SYNTHETIC-SMARTVISTA-EVIDENCE',
    recordedAt: '2026-10-13T20:00:00.000Z',
  };
  return { target, row, input: { version: 1, bindings: [row] } };
}
