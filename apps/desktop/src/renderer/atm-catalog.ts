import type { AtmProfile, Entity } from '../../../../packages/domain/src/catalogs';

export function matchesAtmSearch(atm: AtmProfile, entity: Entity | undefined, search: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  const text = normalize(
    `${atm.alias} ${atm.terminalId} ${atm.acquirerId} ${entity?.code ?? ''} ${entity?.name ?? ''}`,
  );
  return normalize(search)
    .trim()
    .split(/\s+/)
    .every((term) => text.includes(term));
}

// Match SQLite's case-sensitive uniqueness after the domain trims input.
export function duplicateAtmTerminal(
  atms: readonly AtmProfile[],
  terminalId: string,
  environment: string | undefined,
  editingId: string | null,
) {
  return atms.some(
    (atm) =>
      atm.environment === environment &&
      atm.id !== editingId &&
      atm.terminalId === terminalId.trim(),
  );
}
