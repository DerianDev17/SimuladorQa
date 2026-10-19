import type {
  CardReaderMonitor,
  CardReaderSnapshot,
} from '../../../../../packages/domain/src/card-reader';

// Explicit simulation for CI; never selected automatically as a hardware fallback.
export class SimulatedCardReader implements CardReaderMonitor {
  private listeners = new Set<(snapshot: CardReaderSnapshot | null) => void>();
  constructor(private readonly snapshot: () => CardReaderSnapshot) {}
  async inspect(): Promise<CardReaderSnapshot> {
    return structuredClone(this.snapshot());
  }
  subscribe(listener: (snapshot: CardReaderSnapshot | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  notify(): void {
    for (const listener of this.listeners) listener(structuredClone(this.snapshot()));
  }
  close(): void {
    this.listeners.clear();
  }
}
