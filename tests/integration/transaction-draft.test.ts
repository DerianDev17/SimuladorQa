import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import { WorkerCatalogStore } from '../../apps/desktop/src/main/infrastructure/worker-catalog-store';
import { FilePreferencesStore } from '../../apps/desktop/src/main/infrastructure/preferences-store';
import { CmsV36Catalog } from '../../apps/desktop/src/main/adapters/cms-v36-catalog';
import { MediatorSchemaInspector } from '../../apps/desktop/src/main/adapters/mediator-schema-inspector';
import type { DraftRequest } from '../../packages/domain/src/transaction-draft';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('preparación con preferencias y Worker SQLite reales', () => {
  let directory: string;
  let script: string;
  let preferencesFile: string;
  let store: WorkerCatalogStore;
  let application: DesktopApplication;
  const identity = {
    agentId: randomUUID(),
    hostname: 'test-machine',
    user: 'test-user',
    version: 'test',
    uuid: randomUUID,
    now: () => '2026-10-06T12:00:00.000Z',
  };
  const request: DraftRequest = {
    environment: 'QA',
    transaction: 'BALANCE',
    scenario: 'LOCAL',
    atmId: null,
    atmRevision: null,
    account: 'SAVINGS',
    amount: null,
  };
  const stores: WorkerCatalogStore[] = [];
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-draft-'));
    script = join(directory, 'catalog-worker.cjs');
    await build({
      entryPoints: [resolve('apps/desktop/src/main/infrastructure/catalog-worker.ts')],
      outfile: script,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
    });
  });
  beforeEach(() => {
    preferencesFile = join(directory, `${randomUUID()}.json`);
    store = new WorkerCatalogStore(script, join(directory, `${randomUUID()}.sqlite`));
    stores.push(store);
    application = new DesktopApplication(
      new FilePreferencesStore(preferencesFile),
      identity,
      store,
      new CmsV36Catalog(),
      new MediatorSchemaInspector(),
    );
  });
  afterEach(async () => {
    await store.close();
  });
  afterAll(async () => {
    await Promise.all(stores.map((item) => item.close()));
    await removeTestDirectory(directory, 'coonecta-draft-');
  });
  async function seedAtm() {
    const entity = await application.catalog('saveEntity', {
      environment: 'QA',
      id: null,
      revision: null,
      values: { code: 'TEST', name: 'Synthetic Entity', networkType: 'COONECTA', active: true },
    });
    if (!entity.ok) throw new Error(entity.error.code);
    const entityId = entity.value.entities[0]!.id;
    const atm = await application.catalog('saveAtm', {
      environment: 'QA',
      id: null,
      revision: null,
      values: {
        alias: 'Synthetic ATM',
        entityId,
        terminalId: 'TEST-TERM',
        acquirerId: 'TEST-ACQ',
        active: true,
      },
    });
    if (!atm.ok) throw new Error(atm.error.code);
    return atm.value.atms[0]!;
  }
  it('obtiene fuente CMS desde Main y revisa el ATM existente sin escribir ejecuciones', async () => {
    const atm = await seedAtm();
    const before = await application.catalog('list', { environment: 'QA' });
    const snapshot = await application.getSnapshot();
    expect(snapshot).toMatchObject({
      ok: true,
      value: {
        documentedOperations: expect.arrayContaining([expect.objectContaining({ code: '301000' })]),
      },
    });
    const reviewed = await application.reviewDraft({
      ...request,
      atmId: atm.id,
      atmRevision: atm.revision,
    });
    expect(reviewed).toMatchObject({
      ok: true,
      value: {
        status: 'BLOCKED',
        atm: { id: atm.id, revision: 1, status: 'DRAFT' },
        operation: { code: '301000' },
        account: 'SAVINGS',
        destinationCompatibility: null,
        reviewedAt: identity.now(),
        reviewId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
    expect(await application.catalog('list', { environment: 'QA' })).toEqual(before);
    expect(
      await application.reviewDraft({
        ...request,
        transaction: 'WITHDRAWAL_DECLINED',
        account: 'CURRENT',
        amount: '100.50',
      }),
    ).toMatchObject({
      ok: true,
      value: { operation: { code: '012000' }, amount: '100.50', status: 'BLOCKED' },
    });
  });
  it('identifica cada revisión local con UUID/UTC sin generar una ejecución', async () => {
    const first = await application.reviewDraft(request);
    const second = await application.reviewDraft(request);
    if (!first.ok || !second.ok) throw new Error('Review unavailable');
    expect(first.value.reviewId).not.toBe(second.value.reviewId);
    expect(new Date(first.value.reviewedAt).toISOString()).toBe(first.value.reviewedAt);
    expect(first.value).not.toHaveProperty('transactionId');
    expect(first.value).not.toHaveProperty('runId');
    expect(first.value.status).toBe('BLOCKED');
  });
  it('revisa compatibilidad PREPROD desde Main contra el ATM real sin alterar ni truncar el catálogo', async () => {
    const qaAtm = await seedAtm();
    expect(await application.setEnvironment({ environment: 'PREPROD' })).toMatchObject({
      ok: true,
    });
    const saved = await application.catalog('saveAtm', {
      environment: 'PREPROD',
      id: null,
      revision: null,
      values: {
        alias: 'ATM PREPROD',
        entityId: qaAtm.entityId,
        terminalId: 'TOO-LONG-TERMINAL',
        acquirerId: 'TEST',
        active: true,
      },
    });
    if (!saved.ok) throw new Error('Seed unavailable');
    const atm = saved.value.atms[0]!;
    const before = await application.catalog('list', { environment: 'PREPROD' });
    const reviewed = await application.reviewDraft({
      ...request,
      environment: 'PREPROD',
      atmId: atm.id,
      atmRevision: atm.revision,
    });
    expect(reviewed).toMatchObject({
      ok: true,
      value: {
        status: 'BLOCKED',
        destinationCompatibility: {
          source: { environment: 'PREPROD' },
          checks: expect.arrayContaining([
            expect.objectContaining({ id: 'TERMINAL_ID', status: 'MISMATCH' }),
          ]),
        },
      },
    });
    expect(await application.catalog('list', { environment: 'PREPROD' })).toEqual(before);
  });
  it('mantiene disponible la revisión sin proveedor de esquema y sanitiza un proveedor fallido', async () => {
    const preferences = new FilePreferencesStore(preferencesFile);
    const without = new DesktopApplication(preferences, identity, store, new CmsV36Catalog());
    expect(await without.reviewDraft(request)).toMatchObject({
      ok: true,
      value: { destinationCompatibility: null },
    });
    const failed = new DesktopApplication(preferences, identity, store, new CmsV36Catalog(), {
      assess: () => {
        throw new Error('private dependency detail');
      },
    });
    const result = await failed.reviewDraft(request);
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private dependency detail');
  });
  it('acepta revisar requisitos sin ATM y mantiene el reverso dependiente del original', async () => {
    expect(await application.reviewDraft(request)).toMatchObject({
      ok: true,
      value: { atm: null, status: 'BLOCKED' },
    });
    expect(
      await application.reviewDraft({ ...request, transaction: 'TIMEOUT_REVERSAL', account: null }),
    ).toMatchObject({
      ok: true,
      value: {
        operation: null,
        blockers: expect.arrayContaining([expect.objectContaining({ id: 'ORIGINAL_TRANSACTION' })]),
      },
    });
  });
  it('rechaza producción, montos ambiguos y datos adicionales sin devolver entradas sensibles', async () => {
    for (const candidate of [
      { ...request, environment: 'PROD' },
      { ...request, pan: '0'.repeat(16) },
      { ...request, transaction: 'WITHDRAWAL_APPROVED', amount: '100,50' },
      { ...request, code: 'private-secret' },
    ]) {
      const result = await application.reviewDraft(candidate);
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
      expect(JSON.stringify(result)).not.toContain('private-secret');
      expect(JSON.stringify(result)).not.toContain('0'.repeat(16));
    }
  });
  it('serializa cambio de ambiente y rechaza un borrador del contexto anterior', async () => {
    const [changed, stale] = await Promise.all([
      application.setEnvironment({ environment: 'PREPROD' }),
      application.reviewDraft(request),
    ]);
    expect(changed).toMatchObject({ ok: true });
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(await application.reviewDraft({ ...request, environment: 'PREPROD' })).toMatchObject({
      ok: true,
      value: { environment: 'PREPROD', status: 'BLOCKED' },
    });
  });
  it('revalida la versión del ATM y el estado de su entidad', async () => {
    const atm = await seedAtm();
    const selected = { ...request, atmId: atm.id, atmRevision: atm.revision };
    await application.catalog('saveAtm', {
      environment: 'QA',
      id: atm.id,
      revision: atm.revision,
      values: {
        alias: 'Edited ATM',
        entityId: atm.entityId,
        terminalId: atm.terminalId,
        acquirerId: atm.acquirerId,
        active: true,
      },
    });
    expect(await application.reviewDraft(selected)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    await application.catalog('saveEntity', {
      environment: 'QA',
      id: atm.entityId,
      revision: 1,
      values: { code: 'TEST', name: 'Synthetic Entity', networkType: 'COONECTA', active: false },
    });
    expect(await application.reviewDraft({ ...selected, atmRevision: 2 })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });
  it('informa dependencia ausente y configuración corrupta sin filtrar excepciones', async () => {
    const unavailable = new DesktopApplication(new FilePreferencesStore(preferencesFile), identity);
    expect(await unavailable.reviewDraft(request)).toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    await writeFile(preferencesFile, 'private-secret');
    const result = await application.reviewDraft(request);
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });
  it('maneja timeout del Worker y permite reconciliar la preparación al recuperar el servicio', async () => {
    const hung = join(directory, 'hung.cjs');
    await writeFile(
      hung,
      "const {parentPort}=require('node:worker_threads'); parentPort.on('message',()=>{});",
    );
    const dependency = new WorkerCatalogStore(hung, join(directory, 'timeout.sqlite'), 500);
    stores.push(dependency);
    const preparation = new DesktopApplication(
      new FilePreferencesStore(preferencesFile),
      identity,
      dependency,
      new CmsV36Catalog(),
    );
    expect(await preparation.reviewDraft(request)).toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT' },
    });
    await copyFile(script, hung);
    expect(await preparation.reviewDraft(request)).toMatchObject({
      ok: true,
      value: { status: 'BLOCKED' },
    });
    await dependency.close();
  });
});
