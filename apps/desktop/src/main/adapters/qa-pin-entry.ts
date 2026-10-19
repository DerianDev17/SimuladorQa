import { spawn } from 'node:child_process';
import { join } from 'node:path';

export interface QaPinEntry {
  request(signal: AbortSignal): Promise<Uint8Array | null>;
}

// Native dialog, private pipe, no Renderer IPC carrying PIN. The child exits
// after each entry; neither its output nor errors are forwarded to logs.
export class WindowsQaPinEntry implements QaPinEntry {
  constructor(
    private readonly script: string,
    private readonly deadlineMs = 60000,
  ) {}

  request(signal: AbortSignal): Promise<Uint8Array | null> {
    if (signal.aborted) return Promise.reject(Error('QA_PIN_CANCELLED'));
    return new Promise((resolve, reject) => {
      const child = spawn(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32/WindowsPowerShell/v1.0/powershell.exe',
        ),
        ['-NoLogo', '-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-File', this.script],
        // Let PowerShell hide its console explicitly. STARTUPINFO/SW_HIDE from
        // windowsHide can also hide the first WinForms PIN window on Windows.
        { windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const bytes = Buffer.alloc(32);
      let used = 0;
      let settled = false;
      const finish = (error?: string, value: Uint8Array | null = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        bytes.fill(0);
        child.kill();
        if (error) reject(Error(error));
        else resolve(value);
      };
      const cancel = () => finish('QA_PIN_CANCELLED');
      const timer = setTimeout(() => finish('QA_PIN_TIMEOUT'), this.deadlineMs);
      signal.addEventListener('abort', cancel, { once: true });
      child.stderr.resume();
      child.once('error', () => finish('QA_PIN_UNAVAILABLE'));
      child.stdout.on('data', (chunk: Buffer) => {
        if (settled || used + chunk.length > bytes.length) {
          chunk.fill(0);
          finish('QA_PIN_UNAVAILABLE');
          return;
        }
        chunk.copy(bytes, used);
        used += chunk.length;
        chunk.fill(0);
      });
      child.once('close', (code) => {
        if (settled) return;
        let end = used;
        while (end && [10, 13].includes(bytes[end - 1]!)) end--;
        const value = bytes.subarray(0, end);
        if (code !== 0) finish('QA_PIN_UNAVAILABLE');
        else if (value.equals(Buffer.from('CANCEL'))) finish();
        else if (end >= 1 && end <= 14 && value.every((byte) => byte >= 48 && byte <= 57))
          finish(undefined, Buffer.from(value));
        else finish('QA_PIN_UNAVAILABLE');
      });
      if (signal.aborted) cancel();
    });
  }
}
