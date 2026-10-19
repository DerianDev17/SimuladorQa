import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { selectActiveSource, isDatedBackup } from './atm-source-selection.mjs';

const source = resolve(process.argv[2] ?? 'Docs tecnicos/imagen cajero');
const privateRoot = resolve('artifacts/atm-image-review/active-sources');
const rootRelative = relative(resolve('artifacts'), privateRoot);
if (rootRelative.startsWith('..') || isAbsolute(rootRelative)) throw Error('OUTPUT_PATH_INVALID');
mkdirSync(privateRoot, { recursive: true });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const requested = {
  'ConfigFiles.rar': [
    'EXTBASE.config',
    'EXTBASEATM.config',
    'NdcConfig.XML',
    'COONECTA_ATM.XML',
    'Extremedata.xml',
    'SRVPIN.XML',
    'ISOBASEI.bin',
    'HostCMS.config',
  ],
  'Dotnet.rar': [
    'ATMIso8583.dll',
    'SetInitialTransactionCoonecta.dll',
    'ExtremeTools.dll',
    'MsgFormatDotNet.dll',
    'ExtremeICryptoCMS.dll',
    'EXTREME_ATMS_2017.dll',
  ],
  'DotNet32.rar': ['AuthParamNDCLib.dll', 'AuthParamTCSLib.dll'],
  'Bin.rar': ['WCFExtremeCrypto.dll', 'WCFCryptoServer.exe'],
};
const archives = [];
for (const [archive, names] of Object.entries(requested)) {
  const path = join(source, archive);
  const listed = spawnSync('tar', ['-tf', path], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  if (listed.status !== 0) throw Error('ARCHIVE_LIST_FAILED');
  const entries = listed.stdout.split(/\r?\n/).filter(Boolean);
  if (
    entries.some(
      (entry) =>
        entry.startsWith('/') ||
        entry.startsWith('-') ||
        /[\\:]/.test(entry) ||
        [...entry].some((letter) => letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127) ||
        entry.split('/').includes('..'),
    )
  )
    throw Error('ARCHIVE_PATH_INVALID');
  const active = names.map((name) => ({ name, entry: selectActiveSource(entries, name) }));
  archives.push({
    archive,
    sha256: sha256(readFileSync(path)),
    datedBackups: entries.filter(isDatedBackup).length,
    active: active.map((item) => {
      if (!item.entry) return item;
      // Read one selected member into memory; never materialize archive links.
      const extracted = spawnSync('tar', ['-xOf', path, item.entry], {
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      });
      if (extracted.status !== 0 || !extracted.stdout.length) throw Error('ARCHIVE_READ_FAILED');
      const digest = sha256(extracted.stdout);
      extracted.stdout.fill(0);
      return { ...item, sha256: digest };
    }),
  });
}
const report = {
  inspectionId: randomUUID(),
  inspectedAtUtc: new Date().toISOString(),
  selectionRule: 'USER_CONFIRMED_UNDATED_CANONICAL_FILES',
  vendorProgramsExecuted: false,
  networkAttempted: false,
  archives,
};
writeFileSync(join(privateRoot, 'manifest.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
