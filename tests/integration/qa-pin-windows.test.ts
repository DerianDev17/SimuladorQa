import { spawn } from 'node:child_process';
import { createCipheriv, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WindowsQaPinCipher } from '../../apps/desktop/src/main/adapters/qa-pin-cipher';
import { WindowsQaPinEntry } from '../../apps/desktop/src/main/adapters/qa-pin-entry';
import { removeTestDirectory } from '../helpers/temporary-directory';
import { qaExecutionFixture } from '../helpers/qa-execution';

describe.skipIf(process.platform !== 'win32')('PIN: procesos privados Windows y DPAPI', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-qa-pin-'));
  });
  afterEach(async () => {
    await removeTestDirectory(directory, 'coonecta-qa-pin-');
  });
  it('importa una clave QA por pipe con KCV validado; rechaza errores y reemplazos', async () => {
    const { input, row } = qaExecutionFixture();
    await writeFile(join(directory, 'qa-execution-profiles.json'), JSON.stringify(input));
    const key = Buffer.from(Array.from({ length: 16 }, (_, index) => index * 7 + 1));
    const cipher = createCipheriv('des-ede', key, null);
    cipher.setAutoPadding(false);
    const check = Buffer.concat([cipher.update(Buffer.alloc(8)), cipher.final()]);
    const run = async (value: unknown) => {
      const child = spawn(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32/WindowsPowerShell/v1.0/powershell.exe',
        ),
        [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          resolve('tooling/enroll-qa-test-key.ps1'),
          '-ProfileId',
          row.id,
          '-UserDataDirectory',
          directory,
          '-InputFromStdin',
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const chunks: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stdin.on('error', () => undefined);
      child.stdin.end(JSON.stringify(value) + '\n');
      const code = await new Promise<number | null>((done, reject) => {
        child.once('error', reject);
        child.once('close', done);
      });
      return { code, output: Buffer.concat(chunks).toString().trim() };
    };
    try {
      expect(await run({ key: 'invalid', expectedCheck: '000000' })).toEqual({
        code: 1,
        output: 'QA_TEST_KEY_NOT_ENROLLED',
      });
      expect(
        await run({ key: key.toString('hex').toUpperCase(), expectedCheck: '000000' }),
      ).toEqual({ code: 1, output: 'QA_TEST_KEY_NOT_ENROLLED' });
      const valid = {
        key: key.toString('hex').toUpperCase(),
        expectedCheck: check.subarray(0, 3).toString('hex').toUpperCase(),
      };
      expect(await run(valid)).toEqual({ code: 0, output: 'QA_TEST_KEY_PROTECTED' });
      expect(
        await new WindowsQaPinCipher(
          resolve('apps/desktop/src/main/adapters/qa-pin-cipher.ps1'),
          join(directory, 'qa-test-keys'),
        ).available(row.keyReference),
      ).toBe(true);
      expect(await run(valid)).toEqual({ code: 1, output: 'QA_TEST_KEY_NOT_ENROLLED' });
    } finally {
      key.fill(0);
      check.fill(0);
    }
  }, 20000);
  it('provisionamiento rechaza PROD antes de abrir un dialogo o escribir claves', async () => {
    const { input, row } = qaExecutionFixture();
    row.environment = 'PROD';
    await writeFile(join(directory, 'qa-execution-profiles.json'), JSON.stringify(input));
    const child = spawn(
      join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      [
        '-NoProfile',
        '-STA',
        '-File',
        resolve('tooling/enroll-qa-test-key.ps1'),
        '-ProfileId',
        row.id,
        '-UserDataDirectory',
        directory,
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.resume();
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    const result = await new Promise<number | null>((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });
    expect(result).toBe(1);
    expect(output.trim()).toBe('QA_TEST_KEY_NOT_ENROLLED');
  });
  it('cifra un bloque sintetico con la clave TEST protegida para este usuario', async () => {
    const reference = randomUUID();
    const key = Buffer.from(Array.from({ length: 16 }, (_, index) => index * 7 + 1));
    const script = join(directory, 'provision-synthetic.ps1');
    await writeFile(
      script,
      `param([string]$Destination)
$ErrorActionPreference = 'Stop'
try {
$testStage = 'INPUT'
$testValue = [Console]::ReadLine()
$testInputLength = if ($null -eq $testValue) { -1 } else { $testValue.Length }
$testStage = 'SECURE_STRING'
$testSecure = [Security.SecureString]::new()
foreach ($testCharacter in $testValue.ToCharArray()) { $testSecure.AppendChar($testCharacter) }
$testSecure.MakeReadOnly()
$testStage = 'CREDENTIAL'
$testCredential = [Management.Automation.PSCredential]::new('QA:TDEA_2KEY_ECB', $testSecure)
$testStage = 'EXPORT'
$testCredential | Export-Clixml -Path $Destination
$testValue = $null
$testSecure.Dispose()
} catch { [Console]::Error.WriteLine($testStage + ':' + $testInputLength + ':' + $_.Exception.GetType().Name); exit 1 }
`,
    );
    const provision = spawn(
      join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        script,
        '-Destination',
        join(directory, reference + '.credential.xml'),
      ],
      { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] },
    );
    provision.stdin.write(key.toString('hex') + '\n');
    let stage = '';
    provision.stderr.on('data', (chunk: Buffer) => {
      stage += chunk.toString();
    });
    await new Promise<void>((resolveDone, reject) => {
      provision.once('error', reject);
      provision.once('close', (code) =>
        code === 0 ? resolveDone() : reject(Error('SYNTHETIC_PROVISION_FAILED ' + stage.trim())),
      );
    });
    const cipher = new WindowsQaPinCipher(
      resolve('apps/desktop/src/main/adapters/qa-pin-cipher.ps1'),
      directory,
    );
    expect(await cipher.available(reference)).toBe(true);
    const block = Buffer.from([4, 1, 2, 3, 4, 5, 6, 7]);
    const expected = createCipheriv('des-ede', key, null);
    expected.setAutoPadding(false);
    const coldStart = performance.now();
    const encrypted = await cipher.encrypt(block, reference, new AbortController().signal);
    const coldMs = performance.now() - coldStart;
    expect(encrypted).toEqual(Buffer.concat([expected.update(block), expected.final()]));
    encrypted.fill(0);
    cipher.begin();
    try {
      expect(await cipher.available(reference)).toBe(true);
      const warmStart = performance.now();
      // Distinct input vectors, same protected credential, one long-lived helper.
      const blocks = Array.from({ length: 12 }, (_, index) => Buffer.alloc(8, index));
      const outputs = await Promise.all(
        blocks.map((input) => cipher.encrypt(input, reference, new AbortController().signal)),
      );
      const warmTotalMs = performance.now() - warmStart;
      outputs.forEach((output, index) => {
        const testCipher = createCipheriv('des-ede', key, null);
        testCipher.setAutoPadding(false);
        expect(output).toEqual(
          Buffer.concat([testCipher.update(blocks[index]!), testCipher.final()]),
        );
        output.fill(0);
        blocks[index]!.fill(0);
      });
      await mkdir(resolve('artifacts'), { recursive: true });
      await writeFile(
        resolve('artifacts/load-cipher-benchmark.json'),
        JSON.stringify(
          {
            scope: 'Synthetic Windows DPAPI cipher only; excludes physical chip and host',
            measuredAt: new Date().toISOString(),
            coldMs,
            warmCount: outputs.length,
            warmTotalMs,
            warmAverageMs: warmTotalMs / outputs.length,
          },
          null,
          2,
        ),
      );
      // Revocation is observed by the existing helper, not just by a restart.
      await writeFile(join(directory, reference + '.credential.xml'), 'revoked');
      await expect(cipher.encrypt(block, reference, new AbortController().signal)).rejects.toThrow(
        'QA_PIN_UNAVAILABLE',
      );
      expect(await cipher.available(reference)).toBe(false);
    } finally {
      cipher.end();
      key.fill(0);
      block.fill(0);
    }
  });
  it('detecta una referencia ausente o un archivo que no contiene una clave DPAPI', async () => {
    const reference = randomUUID();
    const cipher = new WindowsQaPinCipher(
      resolve('apps/desktop/src/main/adapters/qa-pin-cipher.ps1'),
      directory,
    );
    expect(await cipher.available(reference)).toBe(false);
    await writeFile(join(directory, reference + '.credential.xml'), 'invalid protected credential');
    expect(await cipher.available(reference)).toBe(false);
    await expect(
      cipher.encrypt(Buffer.alloc(8), reference, new AbortController().signal),
    ).rejects.toThrow('QA_PIN_UNAVAILABLE');
  });
  it('recibe una entrada sintetica por pipe sin transmitirla en argumentos', async () => {
    const script = join(directory, 'entry.ps1');
    await writeFile(
      script,
      '[Console]::WriteLine(([string][char]49 + [char]50 + [char]51 + [char]52))',
    );
    const entry = new WindowsQaPinEntry(script);
    const pin = await entry.request(new AbortController().signal);
    expect(pin).toEqual(Buffer.from([49, 50, 51, 52]));
    pin?.fill(0);
  });
  it('cancelacion nativa termina sin entregar PIN', async () => {
    const script = join(directory, 'cancel.ps1');
    await writeFile(script, "[Console]::WriteLine('CANCEL')");
    expect(await new WindowsQaPinEntry(script).request(new AbortController().signal)).toBeNull();
  });
  it('rechaza salida inesperada y aplica deadline a una ventana sin respuesta', async () => {
    const script = join(directory, 'invalid.ps1');
    await writeFile(script, "[Console]::WriteLine(('X' * 100))");
    await expect(
      new WindowsQaPinEntry(script).request(new AbortController().signal),
    ).rejects.toThrow('QA_PIN_UNAVAILABLE');
    await writeFile(script, 'Start-Sleep -Seconds 30');
    await expect(
      new WindowsQaPinEntry(script, 20).request(new AbortController().signal),
    ).rejects.toThrow('QA_PIN_TIMEOUT');
  });
});
