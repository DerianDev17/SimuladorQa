import type {
  SavedLoadConfiguration,
  SaveLoadConfiguration,
  DeleteLoadConfiguration,
  LoadConfigurationAudit,
} from '../../../../packages/domain/src/load-configurations';
export interface LoadConfigurationStore {
  listAudit(): Promise<LoadConfigurationAudit[]>;
  list(): Promise<SavedLoadConfiguration[]>;
  save(request: SaveLoadConfiguration): Promise<SavedLoadConfiguration[]>;
  delete(request: DeleteLoadConfiguration): Promise<SavedLoadConfiguration[]>;
}
export class LoadConfigurationConflict extends Error {}
