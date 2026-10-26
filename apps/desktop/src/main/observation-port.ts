import type {
  ObservationBatch,
  ObservationRequest,
} from '../../../../packages/domain/src/observations';
import type { Result } from '../../../../packages/shared/src/contracts';
import type {
  MediatorLiveBatch,
  MediatorLiveRequest,
} from '../../../../packages/domain/src/mediator-live';

export interface TransactionObserver {
  search(request: ObservationRequest): Promise<Result<ObservationBatch>>;
  live?(request: MediatorLiveRequest): Promise<Result<MediatorLiveBatch>>;
}
