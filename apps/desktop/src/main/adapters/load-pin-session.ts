import type { QaPinEntry } from './qa-pin-entry';

// Explicitly authorized QA run only. No disk/Renderer exposure; provider copies
// are erased by the existing per-transaction finally block.
export class LoadPinSession implements QaPinEntry {
  private pin: Uint8Array | undefined;
  private active = false;
  private opening: Promise<void> | undefined;
  private generation = 0;
  constructor(private readonly delegate: QaPinEntry) {}
  begin(): void {
    if (this.active) throw Error('PIN_SESSION_BUSY');
    this.active = true;
    this.generation++;
  }
  async request(signal: AbortSignal): Promise<Uint8Array | null> {
    if (!this.active) return this.delegate.request(signal);
    if (signal.aborted) return null;
    if (!this.pin) {
      const generation = this.generation;
      this.opening ??= (async () => {
        const pin = await this.delegate.request(signal);
        if (!pin) throw Error('QA_PIN_CANCELLED');
        if (!this.active || signal.aborted || generation !== this.generation) {
          pin.fill(0);
          throw Error('QA_PIN_CANCELLED');
        }
        this.pin = pin;
      })();
      await this.opening;
    }
    return this.active && !signal.aborted && this.pin ? Uint8Array.from(this.pin) : null;
  }
  end(): void {
    this.active = false;
    this.generation++;
    this.pin?.fill(0);
    this.pin = undefined;
    this.opening = undefined;
  }
}
