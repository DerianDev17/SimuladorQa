import { posix } from 'node:path';

const hasControl = (value) =>
  [...value].some((letter) => letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127);

// User-confirmed convention: names with dates are backups. Version identifiers
// such as Extreme.Switch2013PCI.dll remain valid module names, not calendar dates.
export function isDatedBackup(source) {
  if (typeof source !== 'string' || !source || source.length > 260)
    throw Error('SOURCE_NAME_INVALID');
  return source
    .replaceAll('\\', '/')
    .split('/')
    .some(
      (name) =>
        /(?:19|20)\d{2}[-_. ]?\d{2}[-_. ]?\d{2}/.test(name) ||
        /\d{2}[-_. ]?\d{2}[-_. ]?(?:19|20)\d{2}/.test(name),
    );
}

export function selectActiveSource(entries, expected) {
  if (
    !Array.isArray(entries) ||
    entries.length > 10000 ||
    typeof expected !== 'string' ||
    !expected ||
    /[\\/:]/.test(expected) ||
    hasControl(expected) ||
    isDatedBackup(expected)
  )
    throw Error('SOURCE_SELECTION_INVALID');
  const matches = entries.filter((entry) => {
    if (typeof entry !== 'string' || hasControl(entry)) throw Error('SOURCE_NAME_INVALID');
    const normalized = entry.replaceAll('\\', '/');
    if (
      normalized.startsWith('/') ||
      normalized.includes(':') ||
      normalized.split('/').includes('..')
    )
      throw Error('SOURCE_PATH_INVALID');
    return (
      !isDatedBackup(entry) && posix.basename(normalized).toLowerCase() === expected.toLowerCase()
    );
  });
  if (matches.length > 1) throw Error('SOURCE_SELECTION_AMBIGUOUS');
  return matches[0] ?? null;
}
