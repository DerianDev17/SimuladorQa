import { lstat, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  LoadExportDocument,
  LoadExportStatus,
} from '../../../../../packages/domain/src/load-export';
import type { LoadExportSink, ExportSaveDialog } from '../load-export-service';
function within(path: string, root: string): boolean {
  const part = relative(root, path);
  return part === '' || (!part.startsWith('..' + sep) && part !== '..' && !isAbsolute(part));
}
export class FileLoadExportSink implements LoadExportSink {
  constructor(
    private readonly dialog: ExportSaveDialog,
    private readonly protectedDirectory: string,
  ) {}
  async save(document: LoadExportDocument, signal: AbortSignal): Promise<LoadExportStatus> {
    if (signal.aborted) throw Error('EXPORT_ABORTED');
    const selected = await this.dialog.choose({
      filename: document.filename,
      format: document.format,
    });
    if (signal.aborted) throw Error('EXPORT_ABORTED');
    if (!selected) return 'CANCELLED';
    const extension = '.' + document.format.toLowerCase();
    const destination = resolve(extname(selected) ? selected : selected + extension);
    if (extname(destination).toLowerCase() !== extension) throw Error('EXPORT_EXTENSION');
    // Resolve the parent to reject directory links into application data as well.
    const parent = await realpath(dirname(destination));
    const root = await realpath(this.protectedDirectory);
    if (within(destination, resolve(this.protectedDirectory)) || within(parent, root))
      throw Error('EXPORT_PROTECTED');
    try {
      if (!(await lstat(destination)).isFile()) throw Error('EXPORT_NOT_REGULAR');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temporary = join(parent, `.load-export-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, document.contents, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
        signal,
      });
      if (signal.aborted) throw Error('EXPORT_ABORTED');
      await rename(temporary, destination);
      return 'SAVED';
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
}
