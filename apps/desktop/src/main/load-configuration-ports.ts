import type {
  SavedLoadConfiguration,
  SaveLoadConfiguration,
  DeleteLoadConfiguration,
} from '../../../../packages/domain/src/load-configurations';
export interface LoadConfigurationStore {
  list(): Promise<SavedLoadConfiguration[]>;
  save(request: SaveLoadConfiguration): Promise<SavedLoadConfiguration[]>;
  delete(request: DeleteLoadConfiguration): Promise<SavedLoadConfiguration[]>;
}
export class LoadConfigurationConflict extends Error {}
