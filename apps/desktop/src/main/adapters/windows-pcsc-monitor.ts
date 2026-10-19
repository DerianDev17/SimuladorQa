import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type {
  CardReaderMonitor,
  CardReaderSnapshot,
} from '../../../../../packages/domain/src/card-reader';
import { decodeReaderStatus } from './windows-pcsc-reader';

// One passive PC/SC process waits for OS events. No polling, APDU or card connection.
export class WindowsPcscMonitor implements CardReaderMonitor {
  private snapshot: CardReaderSnapshot | undefined;
  private listeners = new Set<(snapshot: CardReaderSnapshot | null) => void>();
  private waiters = new Set<{
    resolve: (snapshot: CardReaderSnapshot) => void;
    reject: (error: Error) => void;
  }>();
  private stop: (() => void) | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private closed = false;

  constructor(
    private readonly script: string,
    private readonly timeoutMs = 8000,
    private readonly platform = process.platform,
    private readonly runtime = process.env.SystemRoot ?? 'C:\\Windows',
  ) {}

  subscribe(listener: (snapshot: CardReaderSnapshot | null) => void): () => void {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
    };
  }

  inspect(): Promise<CardReaderSnapshot> {
    if (this.closed || this.platform !== 'win32') return Promise.reject(Error('PCSC_UNAVAILABLE'));
    if (this.snapshot) return Promise.resolve(structuredClone(this.snapshot));
    clearTimeout(this.retry);
    this.retry = undefined;
    return new Promise((resolve, reject) => {
      this.waiters.add({ resolve, reject });
      this.start();
    });
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.retry);
    this.retry = undefined;
    this.listeners.clear();
    this.stop?.();
    this.snapshot = undefined;
    for (const waiter of this.waiters) waiter.reject(Error('PCSC_UNAVAILABLE'));
    this.waiters.clear();
  }

  private start(): void {
    if (this.closed || this.stop || this.retry || this.platform !== 'win32') return;
    const child = spawn(
      join(this.runtime, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', this.script],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let output = '';
    let ended = false;
    const finish = (code: string) => {
      if (ended) return;
      ended = true;
      clearTimeout(startup);
      this.stop = undefined;
      this.snapshot = undefined;
      output = '';
      child.kill();
      for (const waiter of this.waiters) waiter.reject(Error(code));
      this.waiters.clear();
      if (this.closed) return;
      // Only a failed dependency is retried; an idle reader never restarts.
      this.retry = setTimeout(
        () => {
          this.retry = undefined;
          this.start();
        },
        Math.min(30000, 1000 * 2 ** Math.min(this.failures++, 5)),
      );
      for (const listener of this.listeners) listener(null);
    };
    const startup = setTimeout(() => finish('PCSC_TIMEOUT'), this.timeoutMs);
    this.stop = () => finish('PCSC_UNAVAILABLE');
    child.once('error', () => finish('PCSC_UNAVAILABLE'));
    child.once('close', () => finish('PCSC_UNAVAILABLE'));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (ended) return;
      output += chunk;
      let newline: number;
      while ((newline = output.indexOf('\n')) >= 0) {
        const line = output.slice(0, newline).trim();
        output = output.slice(newline + 1);
        if (!line) continue;
        let snapshot: CardReaderSnapshot;
        try {
          snapshot = decodeReaderStatus(line, new Date().toISOString());
        } catch {
          finish('PCSC_UNAVAILABLE');
          return;
        }
        clearTimeout(startup);
        this.failures = 0;
        this.snapshot = snapshot;
        for (const waiter of this.waiters) waiter.resolve(structuredClone(snapshot));
        this.waiters.clear();
        for (const listener of this.listeners) listener(structuredClone(snapshot));
      }
      if (output.length > 16384) finish('PCSC_UNAVAILABLE');
    });
  }
}
