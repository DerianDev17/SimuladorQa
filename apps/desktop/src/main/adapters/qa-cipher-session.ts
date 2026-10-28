import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';

// Private, bounded per-key worker. DPAPI credential is re-read on every command;
// neither plaintext keys nor encrypted PIN blocks are cached between requests.
export class QaCipherSession {
  private child: ChildProcessWithoutNullStreams;
  private closed = false;
  private queue: Promise<void> = Promise.resolve();
  private output = Buffer.alloc(32);
  private used = 0;
  private pending:
    { resolve(value: Uint8Array): void; reject(error: Error): void; cleanup(): void } | undefined;

  constructor(script: string, directory: string, reference: string) {
    this.child = spawn(
      join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        script,
        '-KeyDirectory',
        directory,
        '-KeyReference',
        reference,
        '-Persistent',
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    this.child.stderr.resume();
    this.child.stdin.on('error', () => this.close());
    this.child.once('error', () => this.close());
    this.child.once('close', () => this.close());
    this.child.stdout.on('data', (chunk: Buffer) => {
      if (!this.pending || this.used + chunk.length > this.output.length) {
        chunk.fill(0);
        this.close();
        return;
      }
      chunk.copy(this.output, this.used);
      this.used += chunk.length;
      chunk.fill(0);
      const newline = this.output.subarray(0, this.used).indexOf(10);
      if (newline < 0) return;
      const text = this.output.toString('ascii', 0, this.used).trim();
      if (newline !== this.used - 1 || !/^[A-F0-9]{16}$/.test(text)) {
        this.close();
        return;
      }
      const value = Buffer.from(text, 'hex');
      const pending = this.pending;
      this.pending = undefined;
      this.output.fill(0);
      this.used = 0;
      pending.cleanup();
      pending.resolve(value);
    });
  }

  encrypt(block: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
    const copy = Buffer.from(block);
    const result = this.queue
      .then(() => {
        if (this.closed || signal.aborted) throw Error('QA_PIN_UNAVAILABLE');
        return new Promise<Uint8Array>((resolve, reject) => {
          const cancel = () => this.close();
          const timer = setTimeout(cancel, 5000);
          this.pending = {
            resolve,
            reject,
            cleanup: () => {
              clearTimeout(timer);
              signal.removeEventListener('abort', cancel);
            },
          };
          signal.addEventListener('abort', cancel, { once: true });
          try {
            this.child.stdin.write(copy.toString('hex').toUpperCase() + '\n');
          } catch {
            this.close();
          }
        });
      })
      .finally(() => copy.fill(0));
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    const pending = this.pending;
    this.pending = undefined;
    pending?.cleanup();
    pending?.reject(Error('QA_PIN_UNAVAILABLE'));
    this.output.fill(0);
    this.used = 0;
    this.child.stdin.end();
    this.child.kill();
  }
}
