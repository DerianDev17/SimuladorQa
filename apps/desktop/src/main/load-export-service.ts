import {
  createLoadExport,
  parseLoadExportRequest,
} from '../../../../packages/domain/src/load-export';
import type {
  LoadExportDocument,
  LoadExportStatus,
} from '../../../../packages/domain/src/load-export';
import type { LoadRunSnapshot } from '../../../../packages/domain/src/load-run';
import { failure } from '../../../../packages/shared/src/contracts';
import type { Result } from '../../../../packages/shared/src/contracts';

export interface ExportSaveDialog {
  choose(document: Pick<LoadExportDocument, 'filename' | 'format'>): Promise<string | null>;
}
export interface LoadExportSink {
  save(document: LoadExportDocument, signal: AbortSignal): Promise<LoadExportStatus>;
}
export class LoadExportService {
  private busy = false;
  constructor(
    private readonly lookup: (request: {
      runId: string;
    }) => Promise<Result<LoadRunSnapshot | null>>,
    private readonly sink: LoadExportSink,
    private readonly now: () => string,
    private readonly deadlineMs = 120_000,
  ) {}
  async export(payload: unknown): Promise<Result<LoadExportStatus>> {
    const request = parseLoadExportRequest(payload);
    if (!request)
      return failure('VALIDATION_ERROR', 'Selecciona una corrida y formato CSV o JSON.');
    if (this.busy)
      return failure('IN_USE', 'Ya hay una exportación abierta. Cierra el diálogo anterior.');
    this.busy = true;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = (async (): Promise<Result<LoadExportStatus>> => {
      try {
        const result = await this.lookup({ runId: request.runId });
        if (abort.signal.aborted) return failure('TIMEOUT', 'Exportación cancelada por plazo.');
        if (!result.ok) return result;
        if (!result.value) return failure('NOT_FOUND', 'No se encontró la corrida guardada.');
        const run = result.value;
        if (run.state === 'RUNNING' || run.state === 'STOPPING')
          return failure('CONFLICT', 'Espera al cierre de la corrida antes de exportarla.');
        const document = createLoadExport(run, request.format, this.now());
        return { ok: true, value: await this.sink.save(document, abort.signal) };
      } catch {
        return failure(
          'STORAGE_UNAVAILABLE',
          'No se pudo guardar la exportación. Revisa la ubicación y sus permisos.',
        );
      } finally {
        // Keep the native dialog exclusive even if the IPC deadline already expired.
        this.busy = false;
      }
    })();
    try {
      return await Promise.race([
        operation,
        new Promise<Result<LoadExportStatus>>((resolve) => {
          timer = setTimeout(() => {
            abort.abort();
            resolve(
              failure(
                'TIMEOUT',
                'La exportación agotó el plazo. Cierra el diálogo y revisa la ubicación elegida antes de repetir.',
              ),
            );
          }, this.deadlineMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      abort.abort();
    }
  }
}
