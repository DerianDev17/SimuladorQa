import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import type {
  CatalogCommand,
  CatalogContext,
} from '../../../../packages/shared/src/catalog-worker';
import type { Result } from '../../../../packages/shared/src/contracts';

export interface CatalogStore {
  execute(command: CatalogCommand, context: CatalogContext): Promise<Result<CatalogSnapshot>>;
  close(): Promise<void>;
}
