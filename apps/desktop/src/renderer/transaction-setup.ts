import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import { selectableAtms } from '../../../../packages/domain/src/catalogs';
import type { Environment } from '../../../../packages/domain/src/index';

export interface AtmSelection {
  environment: Environment;
  id: string;
  revision: number;
}

export function resolveAtmSelection(selection: AtmSelection, catalog: CatalogSnapshot) {
  if (selection.environment !== catalog.environment) return undefined;
  return selectableAtms(catalog).find(
    (atm) => atm.id === selection.id && atm.revision === selection.revision,
  );
}
