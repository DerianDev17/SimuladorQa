import { randomUUID } from 'node:crypto';
import type { AtmProfile, CatalogSnapshot } from '../../packages/domain/src/catalogs';
import type { BalanceTarget } from '../../apps/desktop/src/main/balance-ports';

export function templateAtm(target: BalanceTarget, entityId: string): AtmProfile {
  return {
    id: target.draft.atmId!,
    revision: target.draft.atmRevision!,
    terminalId: target.terminalId,
    alias: target.terminalId,
    entityId,
    acquirerId: '12345678901',
    active: true,
    environment: 'QA',
    status: 'DRAFT',
    createdAt: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-10-27T12:00:00.000Z',
  };
}
export function templateCatalog(target: BalanceTarget): CatalogSnapshot {
  const entityId = randomUUID();
  const atm = templateAtm(target, entityId);
  return {
    environment: 'QA',
    atms: [atm],
    audit: [],
    cases: [],
    entities: [
      {
        id: entityId,
        code: '205',
        name: 'Synthetic QA',
        networkType: 'COONECTA',
        active: true,
        status: 'DRAFT',
        revision: 1,
        createdAt: atm.createdAt,
        updatedAt: atm.updatedAt,
      },
    ],
  };
}
