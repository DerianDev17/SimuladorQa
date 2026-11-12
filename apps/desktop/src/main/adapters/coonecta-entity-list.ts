import {
  entityMemberTypes,
  parseEntityValues,
  type EntityMemberType,
  type EntityValues,
} from '../../../../../packages/domain/src/catalogs';

const sourceTypes: Readonly<Record<string, EntityMemberType>> = {
  'FRONTEND AUT': 'FRONT',
  BACKEND: 'BACK',
  'SWITCH EXTERNO': 'EXTERNAL',
  HIBRIDA: 'HYBRID',
};
export interface CoonectaEntityEntry {
  values: EntityValues;
  sourceInstitution: string | null;
  sourceRows: { line: number; name: string; classification: string }[];
  requiresValidation: boolean;
}
// Explicit operator-approved mapping, never inferred from a PID, endpoint or name.
export function parseCoonectaEntityList(
  text: string,
  mapping: { institutionPrefix: string; missingCodes: Readonly<Record<string, string>> },
): CoonectaEntityEntry[] {
  if (text.length > 1_000_000 || mapping.institutionPrefix !== '8')
    throw Error('ENTITY_IMPORT_MAPPING_REQUIRED');
  const groups = new Map<string, CoonectaEntityEntry>();
  for (const [index, line] of text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .entries()) {
    if (!line.trim()) continue;
    const fields = line.split('\t').map((field) => field.trim());
    if (fields.length !== 6) throw Error(`ENTITY_IMPORT_COLUMNS_LINE_${index + 1}`);
    const sourceName = fields[0]!;
    const name = sourceName.replace(/\s+(ADQ|EMI)(?:\s.*)?$/, '').trim();
    const institution = fields[1]!;
    const code = institution
      ? /^8\d{3}$/.test(institution)
        ? institution.slice(1)
        : undefined
      : mapping.missingCodes[name];
    const memberType = sourceTypes[fields[5]!];
    const values = parseEntityValues({
      code,
      name,
      networkType: 'COONECTA',
      active: true,
      memberTypes: memberType ? [memberType] : undefined,
    });
    if (!code || !/^\d{3}$/.test(code) || !values || !memberType)
      throw Error(`ENTITY_IMPORT_VALUES_LINE_${index + 1}`);
    let entry = groups.get(code);
    if (entry && (entry.values.name !== name || entry.sourceInstitution !== (institution || null)))
      throw Error(`ENTITY_IMPORT_CONFLICT_LINE_${index + 1}`);
    if (!entry) {
      entry = {
        values,
        sourceInstitution: institution || null,
        sourceRows: [],
        requiresValidation: false,
      };
      groups.set(code, entry);
    }
    entry.values.memberTypes = entityMemberTypes.filter(
      (type) => type === memberType || entry!.values.memberTypes?.includes(type),
    );
    entry.sourceRows.push({ line: index + 1, name: sourceName, classification: fields[5]! });
    entry.requiresValidation = entry.values.memberTypes.length > 1;
  }
  if (!groups.size) throw Error('ENTITY_IMPORT_EMPTY');
  return [...groups.values()].sort((a, b) => a.values.code.localeCompare(b.values.code));
}
