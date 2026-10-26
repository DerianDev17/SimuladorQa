import { spawn } from 'node:child_process';
import { createCipheriv, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WindowsQaPinCipher } from '../../apps/desktop/src/main/adapters/qa-pin-cipher';
import { removeTestDirectory } from '../helpers/temporary-directory';

function check(value: Buffer) {
  const cipher = createCipheriv('des-ede', value, null);
  cipher.setAutoPadding(false);
  const result = Buffer.concat([cipher.update(Buffer.alloc(8)), cipher.final()]);
  try {
    return result.subarray(0, 3).toString('hex').toUpperCase();
  } finally {
    result.fill(0);
  }
}
function fixture() {
  // Synthetic non-production components; never use received material in tests.
  const a = Buffer.from(Array.from({ length: 16 }, (_, i) => i * 7 + 1));
  const b = Buffer.from(Array.from({ length: 16 }, (_, i) => i * 9 + 3));
  const combined = Buffer.from(a.map((value, i) => value ^ b[i]!));
  const input = {
    version: 1,
    environment: 'QA',
    terminalId: 'ATM00999',
    keyReference: randomUUID(),
    components: [
      { id: 101, value: a.toString('hex'), check: check(a).slice(0, 4) },
      { id: 102, value: b.toString('hex'), check: check(b).slice(0, 4) },
    ],
    expectedMasterCheck: check(combined),
    expectedNetworkCheck: check(a),
  };
  a.fill(0);
  b.fill(0);
  combined.fill(0);
  return input;
}
function enroll(
  directory: string,
  input: unknown,
): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolveDone, reject) => {
    const child = spawn(
      join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        resolve('tooling/enroll-qa-atm-components.ps1'),
        '-UserDataDirectory',
        directory,
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let out = '',
      err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(Error('QA_ENROLL_TIMEOUT'));
    }, 12000);
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolveDone({ code, out, err });
    });
    child.stdin.on('error', () => {});
    child.stdin.write(JSON.stringify(input) + '\n');
  });
}

describe.skipIf(process.platform !== 'win32')('custodia de componentes ATM en Windows', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-atm-key-'));
  });
  afterEach(async () => {
    await removeTestDirectory(directory, 'coonecta-atm-key-');
  });
  it('comprueba componentes/maestra, protege con DPAPI y rechaza su uso como llave PIN', async () => {
    const input = fixture();
    const result = await enroll(directory, input);
    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    const metadata = JSON.parse(result.out);
    expect(metadata).toMatchObject({
      keyReference: input.keyReference,
      purpose: 'ATM_MASTER',
      masterCheckMatched: true,
      networkCheckMatched: false,
    });
    const keys = join(directory, 'qa-atm-master-keys');
    const stored = await readFile(join(keys, input.keyReference + '.credential.xml'), 'utf16le');
    expect(stored.includes('QA:ATM_MASTER:TDEA_2KEY_ECB:ATM00999')).toBe(true);
    for (const component of input.components) {
      expect(stored).not.toContain(component.value);
      expect(result.out).not.toContain(component.value);
    }
    expect(result.out).not.toContain(input.expectedMasterCheck);
    const cipher = new WindowsQaPinCipher(
      resolve('apps/desktop/src/main/adapters/qa-pin-cipher.ps1'),
      keys,
    );
    expect(await cipher.available(input.keyReference)).toBe(false);
    await expect(
      cipher.encrypt(Buffer.alloc(8), input.keyReference, new AbortController().signal),
    ).rejects.toThrow('QA_PIN_UNAVAILABLE');
    expect((await enroll(directory, input)).code).toBe(1);
    expect(
      (await readFile(join(keys, input.keyReference + '.credential.xml'), 'utf16le')) === stored,
    ).toBe(true);
    expect(await readdir(keys)).toEqual([input.keyReference + '.credential.xml']);
  }, 45000);
  it('una coincidencia de KCV no cambia la finalidad maestra de la credencial', async () => {
    const input = fixture();
    input.expectedNetworkCheck = input.expectedMasterCheck;
    const result = await enroll(directory, input);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({
      purpose: 'ATM_MASTER',
      networkCheckMatched: true,
    });
    const cipher = new WindowsQaPinCipher(
      resolve('apps/desktop/src/main/adapters/qa-pin-cipher.ps1'),
      join(directory, 'qa-atm-master-keys'),
    );
    expect(await cipher.available(input.keyReference)).toBe(false);
  });
  it('falla sin exponer material si el almacenamiento no está disponible', async () => {
    const unavailable = join(directory, 'unavailable');
    await writeFile(unavailable, 'synthetic storage conflict');
    const result = await enroll(unavailable, fixture());
    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err.trim()).toBe('QA_ATM_COMPONENTS_NOT_ENROLLED');
    expect(await readdir(directory)).toEqual(['unavailable']);
  });
  it.each([
    'PROD',
    'MASTER_CHECK',
    'COMPONENT_CHECK',
    'DUPLICATE',
    'EXTRA_FIELD',
    'INVALID_REFERENCE',
  ])('rechaza %s sin almacenar material', async (kind) => {
    const input: Record<string, unknown> = fixture();
    if (kind === 'PROD') input.environment = 'PROD';
    if (kind === 'MASTER_CHECK') input.expectedMasterCheck = 'FFFFFF';
    if (kind === 'COMPONENT_CHECK') (input.components as { check: string }[])[0]!.check = 'FFFF';
    if (kind === 'DUPLICATE') (input.components as { id: number }[])[1]!.id = 101;
    if (kind === 'EXTRA_FIELD') input.unapproved = true;
    if (kind === 'INVALID_REFERENCE') input.keyReference = '../key';
    const result = await enroll(directory, input);
    expect(result).toEqual({
      code: 1,
      out: '',
      err: expect.stringContaining('QA_ATM_COMPONENTS_NOT_ENROLLED'),
    });
    expect(await readdir(directory)).toEqual([]);
  });
});
