import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseCreateQaAtm,
  parseInspectQaAtm,
  parseQaAtmBalanceTest,
} from '../../packages/domain/src/atm-onboarding';
import { balanceRequest, balanceTarget } from '../helpers/balance-inquiry';
import { AtmInspectionService } from '../../apps/desktop/src/main/atm-inspection-service';
import { QaAtmTemplate } from '../../apps/desktop/src/main/qa-atm-template';
import { parseQaExecutionProfileFile } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { qaExecutionFixture } from '../helpers/qa-execution';
import { templateCatalog, templateAtm } from '../helpers/qa-template';
import type { SendConfigurationSnapshot } from '../../packages/domain/src/send-configuration';
import type { Result } from '../../packages/shared/src/contracts';

function setup() {
  const fixture = qaExecutionFixture();
  const catalog = templateCatalog(fixture.target);
  catalog.entities[0]!.memberTypes = ['FRONT'];
  const target = qaExecutionFixture().target;
  target.terminalId = 'ATM20524';
  const atm = templateAtm(target, catalog.entities[0]!.id);
  catalog.atms.push(atm);
  const store = {
    read: vi.fn(async () => parseQaExecutionProfileFile(fixture.input)),
    reserve: vi.fn(),
  };
  const template = new QaAtmTemplate(store, async () => structuredClone(catalog), {
    read: vi.fn(),
  });
  const security = vi.fn(async () => true);
  const config: SendConfigurationSnapshot = {
    environment: 'QA',
    status: 'CONFIGURED_BLOCKED',
    pending: [],
    audit: [],
    documentedEndpoint: null,
    configuration: {
      id: randomUUID(),
      environment: 'QA',
      revision: 1,
      updatedAt: '2026-11-11T15:00:00.000Z',
      endpoint: fixture.target.endpoint,
      evidenceId: null,
      trigger: 'ON_CLICK',
      connectDeadlineMs: 1000,
      observationWindowMs: 1000,
    },
  };
  const send = {
    read: vi.fn(async (): Promise<Result<SendConfigurationSnapshot>> => ({
      ok: true,
      value: structuredClone(config),
    })),
  };
  const inspector = new AtmInspectionService(
    { inspectLocal: (request, endpoint) => template.inspectLocal(request, endpoint, security) },
    send,
    () => '2026-11-11T15:00:00.000Z',
    async () => structuredClone(catalog),
    100,
  );
  const request = { environment: 'QA' as const, atmId: atm.id, revision: 1 };
  return { fixture, catalog, atm, store, template, security, config, send, inspector, request };
}
afterEach(() => vi.useRealTimers());

describe('alta QA/205: límites de entrada', () => {
  const create = {
    environment: 'QA',
    requestId: randomUUID(),
    templateId: randomUUID(),
    templateRevision: 1,
    alias: '  ATM de prueba  ',
    terminalId: 'ATM20524',
  };
  it('normaliza alias y acepta identidades y revisión válidas', () => {
    expect(parseCreateQaAtm(create)).toMatchObject({
      alias: 'ATM de prueba',
      terminalId: 'ATM20524',
    });
    expect(
      parseInspectQaAtm({ environment: 'QA', atmId: create.templateId, revision: 1 }),
    ).toBeDefined();
  });
  it.each([
    { environment: 'PROD' },
    { environment: 'PREPROD' },
    { requestId: 'invalid' },
    { templateRevision: 0 },
    { terminalId: 'atm20524' },
    { terminalId: 'ATM20521' },
    { terminalId: 'ATM205245' },
    { alias: '1234 5678 1234' },
    { keyReference: randomUUID() },
    { active: false },
  ])('rechaza payload fuera del contrato %j', (change) =>
    expect(parseCreateQaAtm({ ...create, ...change })).toBeUndefined(),
  );
  it('rechaza inspección sin revisión, con extras o ambiente ajeno', () => {
    for (const request of [
      { environment: 'PROD', atmId: create.templateId, revision: 1 },
      { environment: 'QA', atmId: create.templateId },
      { environment: 'QA', atmId: create.templateId, revision: 1, endpoint: {} },
    ])
      expect(parseInspectQaAtm(request)).toBeUndefined();
  });
  it('acepta el alta administrativa con entidad/adquirente explícitos y rechaza valores inválidos', () => {
    const manual = {
      environment: 'QA',
      requestId: randomUUID(),
      entityId: randomUUID(),
      entityRevision: 1,
      terminalId: 'QA-ENTITY-01',
      alias: '  Otra entidad  ',
      acquirerId: 'ADQ-TEST',
    };
    expect(parseCreateQaAtm(manual)).toMatchObject({
      entityId: manual.entityId,
      alias: 'Otra entidad',
      acquirerId: 'ADQ-TEST',
    });
    for (const change of [
      { entityRevision: 0 },
      { entityId: '312' },
      { acquirerId: '' },
      { acquirerId: '1234 5678 1234' },
      { templateId: randomUUID() },
      { terminalId: 'ATM20521' },
      { environment: 'PROD' },
    ])
      expect(parseCreateQaAtm({ ...manual, ...change })).toBeUndefined();
  });
  it('exige entidad y revisión en la prueba guiada sin aceptar otros flujos o secretos', () => {
    const request = {
      execution: balanceRequest(balanceTarget()),
      entityId: randomUUID(),
      entityRevision: 1,
    };
    expect(parseQaAtmBalanceTest(request)).toEqual(request);
    for (const change of [
      { entityId: '205' },
      { entityRevision: 0 },
      { pin: 'invalid' },
      {
        execution: {
          ...request.execution,
          draft: { ...request.execution.draft, transaction: 'WITHDRAWAL_APPROVED', amount: '1.00' },
        },
      },
    ])
      expect(parseQaAtmBalanceTest({ ...request, ...change })).toBeUndefined();
  });
});

describe('verificación local sin tarjeta ni efectos financieros', () => {
  it('verifica herencia y pool compartido sin reservar ni exponer configuración privada', async () => {
    const f = setup();
    const before = JSON.stringify(f.fixture.input);
    const result = await f.inspector.inspect(f.request);
    expect(result).toMatchObject({
      ok: true,
      value: {
        readyForBalanceTest: true,
        source: 'ATM20521',
        sequencesRemaining: 2,
        configurationRevision: 1,
      },
    });
    if (result.ok)
      expect(result.value.checks.at(-1)).toMatchObject({ id: 'HOST', status: 'NOT_CHECKED' });
    expect(JSON.stringify(f.fixture.input)).toBe(before);
    expect(f.store.reserve).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(f.fixture.row.keyReference);
    expect(JSON.stringify(result)).not.toContain('fixedFields');
  });
  it.each([
    'inactive',
    'entity',
    'revision',
    'endpoint',
    'missing',
    'corrupt',
    'empty-pool',
    'security',
    'deadlines',
  ])('no habilita la prueba con %s', async (kind) => {
    const f = setup();
    if (kind === 'inactive') f.atm.active = false;
    if (kind === 'entity') f.catalog.entities[0]!.active = false;
    if (kind === 'revision') f.atm.revision++;
    if (kind === 'endpoint') f.config.configuration!.endpoint = { host: '127.0.0.2', port: 1111 };
    if (kind === 'missing') f.fixture.input.profiles.length = 0;
    if (kind === 'corrupt') f.store.read.mockRejectedValue(Error('private-secret'));
    if (kind === 'empty-pool') f.fixture.row.reservedSequences.length = 0;
    if (kind === 'security') f.security.mockResolvedValue(false);
    if (kind === 'deadlines') f.config.configuration!.connectDeadlineMs = null;
    const result = await f.inspector.inspect(f.request);
    expect(result).toMatchObject({ ok: true, value: { readyForBalanceTest: false } });
    expect(JSON.stringify(result)).not.toContain('private-secret');
    expect(f.store.reserve).not.toHaveBeenCalled();
  });
  it('descarta cambios durante la comprobación de seguridad y configuración', async () => {
    const f = setup();
    f.security.mockImplementation(async () => {
      f.atm.revision++;
      return true;
    });
    expect(await f.inspector.inspect(f.request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    f.atm.revision = 1;
    f.security.mockImplementation(async () => {
      f.config.configuration!.revision++;
      return true;
    });
    expect(await f.inspector.inspect(f.request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });
  it.each(['FRONT', 'BACK', 'EXTERNAL', 'HYBRID'] as const)(
    'muestra %s sin heredar una plantilla de otra entidad',
    async (memberType) => {
      const f = setup();
      f.catalog.entities[0]!.code = '312';
      f.catalog.entities[0]!.memberTypes = [memberType];
      const result = await f.inspector.inspect(f.request);
      expect(result).toMatchObject({
        ok: true,
        value: { readyForBalanceTest: false, entity: { code: '312', memberTypes: [memberType] } },
      });
      if (result.ok)
        expect(result.value.checks).toContainEqual(
          expect.objectContaining({ id: 'ENTITY_SCOPE', status: 'ACTION_REQUIRED' }),
        );
      expect(f.security).not.toHaveBeenCalled();
      expect(f.store.reserve).not.toHaveBeenCalled();
    },
  );
  it.each([{ memberTypes: [] }, { memberTypes: ['FRONT', 'EXTERNAL'] }] as const)(
    'impide probar una entidad sin clasificación validada: %j',
    async ({ memberTypes }) => {
      const f = setup();
      f.catalog.entities[0]!.memberTypes = [...memberTypes];
      expect(await f.inspector.inspect(f.request)).toMatchObject({
        ok: true,
        value: { readyForBalanceTest: false },
      });
      expect(f.security).not.toHaveBeenCalled();
    },
  );
  it('rechaza la entidad que cambia mientras se comprueba la seguridad', async () => {
    const f = setup();
    f.security.mockImplementation(async () => {
      f.catalog.entities[0]!.revision++;
      return true;
    });
    expect(await f.inspector.inspect(f.request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });
  it('no confirma un perfil cuando no hay configuración de envío', async () => {
    const f = setup();
    f.config.configuration = null;
    expect(await f.inspector.inspect(f.request)).toMatchObject({
      ok: true,
      value: { readyForBalanceTest: false, configurationRevision: null },
    });
    expect(f.security).not.toHaveBeenCalled();
  });
  it('timeout y error de dependencia son recuperables y sanitizados', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.security.mockImplementation(() => new Promise(() => undefined));
    const waiting = f.inspector.inspect(f.request);
    await vi.advanceTimersByTimeAsync(100);
    expect(await waiting).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(vi.getTimerCount()).toBe(0);
    f.security.mockResolvedValue(true);
    expect(await f.inspector.inspect(f.request)).toMatchObject({
      ok: true,
      value: { readyForBalanceTest: true },
    });
    f.send.read.mockRejectedValue(Error('private-secret'));
    const failed = await f.inspector.inspect(f.request);
    expect(failed).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(JSON.stringify(failed)).not.toContain('private-secret');
  });
});
