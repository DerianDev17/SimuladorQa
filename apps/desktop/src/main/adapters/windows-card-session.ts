import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
import type { CardApduSession } from './emv-card-identity';

export class WindowsCardSession implements CardApduSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffered = '';
  private closed = false;
  private pending:
    | {
        resolve: (row: Record<string, unknown>) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;

  constructor(
    script: string,
    private readonly timeoutMs = 8000,
    runtime = process.env.SystemRoot ?? 'C:\\Windows',
  ) {
    this.child = spawn(
      join(runtime, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.resume();
    this.child.stdin.on('error', () => this.fail('CARD_UNAVAILABLE'));
    this.child.once('error', () => this.fail('CARD_UNAVAILABLE'));
    this.child.once('close', () => this.fail('CARD_UNAVAILABLE'));
    this.child.stdout.on('data', (chunk: string) => {
      this.buffered += chunk;
      if (this.buffered.length > 16384) {
        this.fail('CARD_DATA_INVALID');
        return;
      }
      const newline = this.buffered.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffered.slice(0, newline);
      this.buffered = this.buffered.slice(newline + 1);
      const pending = this.pending;
      if (!pending || this.buffered.trim()) {
        this.fail('CARD_DATA_INVALID');
        return;
      }
      try {
        const value = JSON.parse(line) as unknown;
        if (!value || typeof value !== 'object' || (value as Record<string, unknown>).ok !== true)
          throw Error();
        clearTimeout(pending.timer);
        this.pending = undefined;
        pending.resolve(value as Record<string, unknown>);
      } catch {
        this.fail('CARD_UNAVAILABLE');
      }
    });
  }
  private fail(code: string): void {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(Error(code));
    }
    this.close();
    this.child.kill();
  }
  private call(
    request: Record<string, unknown>,
    timeoutMs = this.timeoutMs,
  ): Promise<Record<string, unknown>> {
    if (this.closed) return Promise.reject(Error('CARD_UNAVAILABLE'));
    if (this.pending) return Promise.reject(Error('CARD_BUSY'));
    return new Promise((resolve, reject) => {
      this.pending = {
        resolve,
        reject,
        timer: setTimeout(() => this.fail('CARD_TIMEOUT'), timeoutMs),
      };
      this.child.stdin.write(JSON.stringify(request) + '\n');
    });
  }
  async open(readerName: string): Promise<void> {
    await this.call({ op: 'open', readerName });
  }
  async transmit(command: Uint8Array): Promise<Uint8Array> {
    const row = await this.call({
      op: 'transmit',
      command: Buffer.from(command).toString('hex').toUpperCase(),
    });
    if (typeof row.response !== 'string' || !/^(?:[A-F0-9]{2}){2,4098}$/.test(row.response)) {
      this.fail('CARD_DATA_INVALID');
      throw Error('CARD_DATA_INVALID');
    }
    return Buffer.from(row.response, 'hex');
  }
  async releaseTransaction(): Promise<void> {
    await this.call({ op: 'release' });
  }
  async isValid(): Promise<boolean> {
    return (await this.call({ op: 'status' }, Math.min(this.timeoutMs, 1500))).valid === true;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.buffered = '';
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(Error('CARD_UNAVAILABLE'));
      this.child.kill();
    }
    this.child.stdin.end('{"op":"close"}\n');
    const child = this.child;
    const timer = setTimeout(() => child.kill(), 1000);
    timer.unref();
    child.once('close', () => clearTimeout(timer));
  }
}
