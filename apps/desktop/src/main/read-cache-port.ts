import type { Result } from '../../../../packages/shared/src/contracts';

// Presentation queries only. Financial validation must read its original ports.
export interface ReadCachePort {
  read<T>(key: string, ttlMs: number, load: () => Promise<Result<T>>): Promise<Result<T>>;
  invalidate(): void;
}
