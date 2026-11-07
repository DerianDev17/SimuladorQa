import type {
  LoadHistoryPage,
  LoadHistoryQuery,
} from '../../../../../packages/domain/src/load-history';
import type { LoadRunSnapshot } from '../../../../../packages/domain/src/load-run';

export type LoadStoreCommand =
  | { kind: 'read' }
  | { kind: 'get'; id: string }
  | { kind: 'list'; query: LoadHistoryQuery }
  | { kind: 'hasRequest'; id: string }
  | { kind: 'write'; run: LoadRunSnapshot }
  | { kind: 'close' };
export interface LoadStoreRequest {
  id: string;
  command: LoadStoreCommand;
}
export type LoadStoreValue = LoadRunSnapshot | LoadHistoryPage | boolean | null | undefined;
export type LoadStoreResponse = { id: string } & (
  { ok: true; value: LoadStoreValue } | { ok: false; code: string }
);
