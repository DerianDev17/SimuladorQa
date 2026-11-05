import type {
  LoadHistoryPage,
  LoadHistoryQuery,
} from '../../../../packages/domain/src/load-history';
import type { LoadRunSnapshot } from '../../../../packages/domain/src/load-run';
export interface LoadHistoryStore {
  list(query: LoadHistoryQuery): Promise<LoadHistoryPage>;
  get(runId: string): Promise<LoadRunSnapshot | null>;
}
