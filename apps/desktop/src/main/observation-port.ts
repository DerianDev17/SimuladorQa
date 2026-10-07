import type {
  ObservationBatch,
  ObservationRequest,
} from '../../../../packages/domain/src/observations';
import type { Result } from '../../../../packages/shared/src/contracts';

export interface TransactionObserver {
  search(request: ObservationRequest): Promise<Result<ObservationBatch>>;
}
