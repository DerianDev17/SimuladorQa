import type {
  CardReaderAdapter,
  CardReaderSnapshot,
} from '../../../../../packages/domain/src/card-reader';

// Explicit simulation for CI; never selected automatically as a hardware fallback.
export class SimulatedCardReader implements CardReaderAdapter {
  constructor(private readonly snapshot: () => CardReaderSnapshot) {}
  async inspect(): Promise<CardReaderSnapshot> {
    return structuredClone(this.snapshot());
  }
}
