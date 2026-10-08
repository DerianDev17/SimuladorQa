import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import { FilePreferencesStore } from '../../apps/desktop/src/main/infrastructure/preferences-store';
import type { TransactionObserver } from '../../apps/desktop/src/main/observation-port';
import { removeTestDirectory } from '../helpers/temporary-directory';
import { observationRequest, observationBatch } from '../helpers/observations';
import {
  decodeResponse,
  MediatorObserver,
} from '../../apps/desktop/src/main/adapters/mediator-observer';
import { cmsFinancialFields } from '../../apps/desktop/src/main/adapters/cms-financial-contract';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

describe('observador y ambiente persistido', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-observations-'));
  });
  afterEach(async () => {
    await removeTestDirectory(directory, 'coonecta-observations-');
  });
  function application(observer?: TransactionObserver) {
    return new DesktopApplication(
      new FilePreferencesStore(join(directory, 'preferences.json')),
      {
        agentId: randomUUID(),
        hostname: 'test-station',
        user: 'test-user',
        version: 'test',
        uuid: randomUUID,
        now: () => '2026-10-07T12:00:00.000Z',
      },
      undefined,
      undefined,
      undefined,
      undefined,
      observer,
    );
  }
  it('devuelve resultados externos sin cambiar estado transaccional ni guardar mensajes', async () => {
    const app = application({ search: async () => ({ ok: true, value: observationBatch() }) });
    await app.setEnvironment({ environment: 'PREPROD' });
    const result = await app.searchObservations(observationRequest);
    expect(result).toMatchObject({
      ok: true,
      value: { ...observationBatch(), queriedAt: '2026-10-07T12:00:00.000Z' },
    });
    if (result.ok) expect(result.value.queryId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('valida entrada, QA y ambiente desactualizado antes de contactar al proveedor', async () => {
    let calls = 0;
    const app = application({
      search: async () => {
        calls++;
        return { ok: true, value: observationBatch() };
      },
    });
    expect(
      await app.searchObservations({ ...observationRequest, environment: 'PROD' }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(
      await app.searchObservations({ ...observationRequest, environment: 'QA' }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await app.searchObservations(observationRequest)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(calls).toBe(0);
  });
  it('descarta respuestas tardías tras PREPROD -> QA -> PREPROD y no bloquea cambios', async () => {
    let complete!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const app = application({
      search: async () => {
        started();
        await pending;
        return { ok: true, value: observationBatch() };
      },
    });
    await app.setEnvironment({ environment: 'PREPROD' });
    const query = app.searchObservations(observationRequest);
    await entered;
    expect(await app.searchObservations(observationRequest)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    await app.setEnvironment({ environment: 'QA' });
    await app.setEnvironment({ environment: 'PREPROD' });
    complete();
    expect(await query).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(await app.searchObservations(observationRequest)).toMatchObject({ ok: true });
  });
  it('controla proveedor ausente, fallos y timeout', async () => {
    for (const observer of [
      undefined,
      {
        search: async () => {
          throw new Error('private-secret');
        },
      },
      {
        search: async () => ({
          ok: false as const,
          error: { code: 'TIMEOUT' as const, message: 'Tiempo agotado' },
        }),
      },
    ]) {
      const app = application(observer);
      await app.setEnvironment({ environment: 'PREPROD' });
      const result = await app.searchObservations(observationRequest);
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).not.toContain('private-secret');
    }
  });
  it.runIf(process.platform === 'win32')(
    'ejecuta el adaptador real: configuración ausente y timeout del proceso',
    async () => {
      const observer = new MediatorObserver(
        resolve('apps/desktop/src/main/adapters/mediator-query.ps1'),
        join(directory, 'missing.json'),
      );
      const result = await observer.search(observationRequest);
      expect(result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      observer.close();
      const short = new MediatorObserver(
        resolve('apps/desktop/src/main/adapters/mediator-query.ps1'),
        join(directory, 'missing.json'),
        1,
      );
      expect(await short.search(observationRequest)).toMatchObject({
        ok: false,
        error: { code: 'TIMEOUT' },
      });
      short.close();
      expect(await short.search(observationRequest)).toMatchObject({
        ok: false,
        error: { code: 'SERVICE_UNAVAILABLE' },
      });
    },
  );
  it.runIf(process.platform === 'win32')(
    'construye SQL parametrizado con tipos reales sin ejecutar la consulta',
    async () => {
      const script = join(directory, 'command-test.ps1');
      const helper = resolve('apps/desktop/src/main/adapters/mediator-command.ps1').replace(
        /'/g,
        "''",
      );
      await writeFile(
        script,
        `Add-Type -AssemblyName System.Data\n. '${helper}'\n$request = [Console]::In.ReadToEnd() | ConvertFrom-Json\n$connection = [System.Data.SqlClient.SqlConnection]::new()\n$command = New-MediatorQuery $connection $request\n$parameters = @($command.Parameters | ForEach-Object { @{ name = $_.ParameterName; type = $_.SqlDbType.ToString(); value = $_.Value.ToString(); kind = if ($_.Value -is [DateTime]) { $_.Value.Kind.ToString() } else { '' } } })\n@{ sql = $command.CommandText; parameters = $parameters } | ConvertTo-Json -Depth 5 -Compress\n$command.Dispose()\n$connection.Dispose()\n`,
      );
      const request = {
        ...observationRequest,
        limit: 100,
        terminalId: 'ATM22004',
        terminalSequence: ((1n << 63n) - 1n).toString(),
        transactionCode: '003000',
        returnCode: '16',
      };
      const output = await new Promise<string>((resolveOutput, reject) => {
        const child = spawn(
          join(
            process.env.SystemRoot ?? 'C:\\Windows',
            'System32/WindowsPowerShell/v1.0/powershell.exe',
          ),
          ['-NoProfile', '-NonInteractive', '-File', script],
          { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
        );
        let stdout = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
        });
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0 ? resolveOutput(stdout) : reject(new Error('Query construction failed')),
        );
        child.stdin.end(JSON.stringify(request));
      });
      const result = JSON.parse(output) as {
        sql: string;
        parameters: { name: string; type: string; value: string; kind: string }[];
      };
      expect(result.sql).toContain('j.jnlTraceId = m.msgTraceId');
      expect(result.sql).toContain('j.jnlRealDate BETWEEN @from AND @to');
      expect(result.sql).toContain('WITH (NOLOCK)');
      expect(result.sql).toContain('ORDER BY m.msgTraceId DESC');
      expect(result.sql).not.toMatch(/SELECT\s+\*|jnlCardNumber|jnlAccountNum|ATM22004|003000/);
      expect(result.parameters).toHaveLength(9);
      expect(result.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: '@take', type: 'Int', value: '101' }),
          expect.objectContaining({
            name: '@sequence',
            type: 'BigInt',
            value: request.terminalSequence,
          }),
          expect.objectContaining({ name: '@from', type: 'DateTime', kind: 'Unspecified' }),
          expect.objectContaining({ name: '@terminal', type: 'VarChar', value: 'ATM22004' }),
          expect.objectContaining({ name: '@code', type: 'VarChar', value: '003000' }),
        ]),
      );
    },
  );
  it.runIf(process.platform === 'win32')(
    'sanitiza XML real con parser .NET sin ejecutar DTD ni filtrar valores',
    async () => {
      const script = join(directory, 'redaction-test.ps1');
      const sanitizer = resolve('apps/desktop/src/main/adapters/mediator-redaction.ps1').replace(
        /'/g,
        "''",
      );
      await writeFile(
        script,
        `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)\n. '${sanitizer}'\n$inputs = [Console]::In.ReadToEnd() | ConvertFrom-Json\n$output = @($inputs | ForEach-Object { Protect-MediatorXml $_ })\n[Console]::WriteLine((ConvertTo-Json -InputObject $output -Compress))\n`,
      );
      const pan = '4'.repeat(16);
      const financialXml = (direction: 'request' | 'response') => {
        const section = (name: string, tag: string) =>
          cmsFinancialFields
            .filter((field) => field.section === name && field.required.includes(direction))
            .map((field) => {
              const observedName = field.aliases[0] ?? field.name;
              const type = field.name === 'EsPos' ? 'b' : field.type;
              return `<${tag} name="${observedName}" value="${pan}"${type === 'string' ? '' : ` type="${type}"`}/>`;
            })
            .join('');
        return `<ExtremeMsg><Header>${section('Header', 'HField')}</Header><Data>${section('Data', 'DField')}</Data></ExtremeMsg>`;
      };
      const inputs = [
        `<ExtremeMsg><Header><HField name="AccountNum1" value="${pan}"/></Header><Data>private-secret<![CDATA[cvv-secret]]><!--comment-secret--></Data></ExtremeMsg>`,
        '<ExtremeMsgReply><Header><HField name="RetCode" value="0"/></Header></ExtremeMsgReply>',
        '<SecretTag name="secret-name" value="secret-value">secret-text</SecretTag>',
        '<!DOCTYPE x [<!ENTITY leak SYSTEM "file:///private-file">]><x>&leak;</x>',
        '<x>broken',
        '<x>'.repeat(22) + '</x>'.repeat(22),
        '<x>' + 's'.repeat(65536) + '</x>',
        '',
        financialXml('request'),
        financialXml('response'),
        '<ExtremeMsg><Data><DField name="EsPos" value="PRIVATE_VALUE" type="PRIVATE_TYPE"/></Data></ExtremeMsg>',
        `<ExtremeMsg><Header>${cmsFinancialFields
          .filter((field) => field.section === 'Header')
          .map((field) => `<HField name="${field.name}" value="PRIVATE_VALUE"/>`)
          .join('')}</Header><Data>${cmsFinancialFields
          .filter((field) => field.section === 'Data')
          .map((field) => `<DField name="${field.name}" value="PRIVATE_VALUE"/>`)
          .join('')}</Data></ExtremeMsg>`,
      ];
      const output = await new Promise<string>((resolveOutput, reject) => {
        const child = spawn(
          join(
            process.env.SystemRoot ?? 'C:\\Windows',
            'System32/WindowsPowerShell/v1.0/powershell.exe',
          ),
          ['-NoProfile', '-NonInteractive', '-File', script],
          { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] },
        );
        let stdout = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
        });
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0 ? resolveOutput(stdout) : reject(new Error('Parser failed')),
        );
        child.stdin.end(JSON.stringify(inputs));
      });
      const values = JSON.parse(output) as string[];
      expect(values[0]).toBe(
        '<ExtremeMsg><Header><HField name="AccountNum1">[PROTEGIDO]</HField></Header><Data>[PROTEGIDO][PROTEGIDO]</Data></ExtremeMsg>',
      );
      expect(values[1]).toContain('name="RetCode"');
      expect(values[2]).toBe('<Campo>[PROTEGIDO]</Campo>');
      expect(values.slice(3, 8)).toEqual([
        '[Mensaje protegido: XML no validado]',
        '[Mensaje protegido: XML no validado]',
        '[Mensaje protegido: limite excedido]',
        '[Mensaje protegido: limite excedido]',
        '[Mensaje ausente o protegido por longitud]',
      ]);
      const batch = observationBatch();
      const decoded = decodeResponse(
        JSON.stringify({
          ok: true,
          value: {
            ...batch,
            rows: [
              {
                ...batch.rows[0],
                transactionCode: '301000',
                requestStructure: values[8],
                responseStructure: values[9],
              },
            ],
          },
        }),
        50,
      );
      expect(decoded).toMatchObject({
        ok: true,
        value: {
          rows: [
            {
              requestContract: {
                status: 'REVIEWED',
                requiredFieldCount: 26,
                missingRequired: [],
                typeDifferences: [
                  { section: 'Data', name: 'EsPos', observed: 'b', documented: 'string' },
                ],
              },
              responseContract: { status: 'REVIEWED', requiredFieldCount: 21, missingRequired: [] },
            },
          ],
        },
      });
      expect(values[10]).toContain('name="EsPos"');
      expect(output).not.toContain('PRIVATE_TYPE');
      expect(output).not.toContain('PRIVATE_VALUE');
      for (const field of cmsFinancialFields) expect(values[11]).toContain(`name="${field.name}"`);
      for (const secret of [
        pan,
        'private-secret',
        'cvv-secret',
        'comment-secret',
        'secret-name',
        'secret-value',
        'secret-text',
        'private-file',
      ])
        expect(output).not.toContain(secret);
    },
  );
  it.runIf(process.platform === 'win32')(
    'mantiene XML protegido si falta el manifiesto CMS',
    async () => {
      const redactor = join(directory, 'redaction-without-manifest.ps1');
      await copyFile(resolve('apps/desktop/src/main/adapters/mediator-redaction.ps1'), redactor);
      const wrapper = join(directory, 'missing-manifest-test.ps1');
      await writeFile(
        wrapper,
        `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n. '${redactor.replace(/'/g, "''")}'\n[Console]::WriteLine((Protect-MediatorXml '<ExtremeMsg><Header><HField name="TraceId" value="PRIVATE_VALUE"/></Header></ExtremeMsg>'))`,
      );
      const { stdout } = await promisify(execFile)(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32/WindowsPowerShell/v1.0/powershell.exe',
        ),
        ['-NoProfile', '-NonInteractive', '-File', wrapper],
        { windowsHide: true, timeout: 4000 },
      );
      expect(stdout.trim()).toBe('[Mensaje protegido: XML no validado]');
      expect(stdout).not.toContain('PRIVATE_VALUE');
    },
  );
});
