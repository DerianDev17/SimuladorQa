import { open } from 'node:fs/promises';
import type { Environment } from '../../../../../packages/domain/src/index';
import { parseNetworkEvidence } from '../../../../../packages/domain/src/network-evidence';
import type {
  NetworkEvidenceCatalog,
  NetworkEvidenceSnapshot,
} from '../../../../../packages/domain/src/network-evidence';

export class FileNetworkEvidence implements NetworkEvidenceCatalog {
  private constructor(private readonly state: NetworkEvidenceSnapshot) {}

  static async load(path: string): Promise<FileNetworkEvidence> {
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(path, 'r');
      const buffer = Buffer.alloc(8193);
      let used = 0;
      while (used < buffer.length) {
        const { bytesRead } = await file.read(buffer, used, buffer.length - used, null);
        if (bytesRead === 0) break;
        used += bytesRead;
      }
      if (used > 8192) return new FileNetworkEvidence({ status: 'UNAVAILABLE' });
      const evidence = parseNetworkEvidence(
        JSON.parse(buffer.toString('utf8', 0, used).replace(/^\uFEFF/, '')),
      );
      return new FileNetworkEvidence(
        evidence ? { status: 'DOCUMENTED', evidence } : { status: 'UNAVAILABLE' },
      );
    } catch (error) {
      return new FileNetworkEvidence({
        status:
          error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
            ? 'NOT_CONFIGURED'
            : 'UNAVAILABLE',
      });
    } finally {
      await file?.close();
    }
  }

  forEnvironment(environment: Environment): NetworkEvidenceSnapshot {
    if (this.state.status === 'DOCUMENTED' && this.state.evidence.environment !== environment)
      return { status: 'NOT_CONFIGURED' };
    // Copia defensiva: un consumidor no puede reasignar la evidencia al otro ambiente.
    return structuredClone(this.state);
  }
}
