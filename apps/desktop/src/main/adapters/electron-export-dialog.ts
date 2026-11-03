import { app, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { ExportSaveDialog } from '../load-export-service';
import type { LoadExportDocument } from '../../../../../packages/domain/src/load-export';
export class ElectronExportDialog implements ExportSaveDialog {
  constructor(private readonly parent: () => BrowserWindow | null) {}
  async choose(document: Pick<LoadExportDocument, 'filename' | 'format'>): Promise<string | null> {
    const parent = this.parent();
    if (!parent || parent.isDestroyed()) throw Error('EXPORT_WINDOW_UNAVAILABLE');
    const result = await dialog.showSaveDialog(parent, {
      title: 'Exportar evidencia de carga',
      buttonLabel: 'Guardar evidencia',
      defaultPath: join(app.getPath('documents'), document.filename),
      filters: [{ name: document.format, extensions: [document.format.toLowerCase()] }],
      properties: ['createDirectory', 'showOverwriteConfirmation', 'dontAddToRecent'],
    });
    return result.canceled ? null : result.filePath;
  }
}
