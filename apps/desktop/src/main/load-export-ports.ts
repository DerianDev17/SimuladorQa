import type {
  LoadExportDocument,
  LoadExportStatus,
} from '../../../../packages/domain/src/load-export';

export interface ExportSaveDialog {
  choose(document: Pick<LoadExportDocument, 'filename' | 'format'>): Promise<string | null>;
}

export interface LoadExportSink {
  save(document: LoadExportDocument, signal: AbortSignal): Promise<LoadExportStatus>;
}
