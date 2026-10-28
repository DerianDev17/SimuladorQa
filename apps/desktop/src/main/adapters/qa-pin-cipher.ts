import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { isUuid } from '../../../../../packages/domain/src/catalogs';
import type { QaPinCipher } from './legacy-qa-pin';
import { QaCipherSession } from './qa-cipher-session';

// Explicit TDEA TEST binding. No algorithm/key is inferred from a vendor name,
// captured F52 or .reg. Each key is a DPAPI-protected SecureString file.
export class WindowsQaPinCipher implements QaPinCipher {
  private scoped = false;
  private sessions = new Map<string, QaCipherSession>();
  begin(): void {
    if (this.scoped) throw Error('QA_PIN_UNAVAILABLE');
    this.scoped = true;
  }
  end(): void {
    this.scoped = false;
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
  constructor(
    private readonly script: string,
    private readonly keyDirectory: string,
  ) {}

  async available(reference: string): Promise<boolean> {
    if (!isUuid(reference)) return false;
    try {
      await access(join(this.keyDirectory, `${reference}.credential.xml`));
      // Verify DPAPI access, algorithm and key validity before opening the PIN
      // dialog. This local zero-block probe never goes to the host.
      const probe = await this.encrypt(Buffer.alloc(8), reference, new AbortController().signal);
      probe.fill(0);
      return true;
    } catch {
      return false;
    }
  }

  encrypt(block: Uint8Array, reference: string, signal: AbortSignal): Promise<Uint8Array> {
    if (block.length !== 8 || !isUuid(reference) || signal.aborted)
      return Promise.reject(Error('QA_PIN_UNAVAILABLE'));
    if (this.scoped) {
      let session = this.sessions.get(reference);
      if (!session) {
        if (this.sessions.size >= 5) return Promise.reject(Error('QA_PIN_UNAVAILABLE'));
        session = new QaCipherSession(this.script, this.keyDirectory, reference);
        this.sessions.set(reference, session);
      }
      return session.encrypt(block, signal);
    }
    return new Promise((resolve, reject) => {
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
          this.script,
          '-KeyDirectory',
          this.keyDirectory,
          '-KeyReference',
          reference,
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const output = Buffer.alloc(32);
      let used = 0,
        done = false;
      const finish = (value?: Uint8Array) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        output.fill(0);
        child.kill();
        if (value) resolve(value);
        else reject(Error('QA_PIN_UNAVAILABLE'));
      };
      const cancel = () => finish();
      const timer = setTimeout(cancel, 5000);
      signal.addEventListener('abort', cancel, { once: true });
      child.stderr.resume();
      child.stdin.on('error', cancel);
      child.once('error', cancel);
      child.stdout.on('data', (chunk: Buffer) => {
        if (done || used + chunk.length > output.length) {
          chunk.fill(0);
          finish();
          return;
        }
        chunk.copy(output, used);
        used += chunk.length;
        chunk.fill(0);
      });
      child.once('close', (code) => {
        if (done) return;
        const text = output.toString('ascii', 0, used).trim();
        finish(code === 0 && /^[A-F0-9]{16}$/.test(text) ? Buffer.from(text, 'hex') : undefined);
      });
      // Keep the private input pipe open until the one-shot helper exits.
      child.stdin.write(Buffer.from(block).toString('hex').toUpperCase() + '\n');
      if (signal.aborted) cancel();
    });
  }
}
