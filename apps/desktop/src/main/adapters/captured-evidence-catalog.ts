import type {
  CaptureEvidence,
  CaptureEvidenceCatalog,
} from '../../../../../packages/domain/src/capture-evidence';
import report from './pcap-evidence.json';

export class CapturedEvidenceCatalog implements CaptureEvidenceCatalog {
  readonly report: CaptureEvidence = {
    ...report,
    environment: 'UNCONFIRMED',
    profile: {
      ...report.profile,
      prefixBytes: 2,
      byteOrder: 'BIG_ENDIAN',
      lengthIncludesPrefix: true,
      headerBytes: 12,
      mtiEncoding: 'ASCII',
      bitmapEncoding: 'ASCII_HEX',
      bitmapBits: 128,
    },
  };
}
