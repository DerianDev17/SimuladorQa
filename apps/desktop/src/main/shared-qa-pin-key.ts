import type { FileQaExecutionProfiles } from './infrastructure/qa-execution-profiles';
import type { QaCmsAtmEvidence, SharedQaPinKeyPort } from './infrastructure/qa-cms-atm-evidence';
import type { QaPinCipherAvailability } from './qa-balance-execution-provider';

// Sharing references never exports/copies a key or substitutes a CMS master
// key. The donor is an existing validated QA execution profile on this link.
export class SharedQaPinKey implements SharedQaPinKeyPort {
  constructor(
    private readonly profiles: Pick<FileQaExecutionProfiles, 'read'>,
    private readonly cipher: Pick<QaPinCipherAvailability, 'available'>,
  ) {}

  async available(evidence: QaCmsAtmEvidence): Promise<boolean> {
    const binding = evidence.directPinKey;
    if (!binding || evidence.environment !== 'QA' || evidence.entityCode !== '205') return false;
    try {
      const source = (await this.profiles.read()).profiles.find(
        (profile) => profile.id === binding.sourceProfileId,
      );
      if (
        !source ||
        source.keyReference !== binding.keyReference ||
        source.endpoint.host !== evidence.senderEndpoint.host ||
        source.endpoint.port !== evidence.senderEndpoint.port
      )
        return false;
      // WindowsQaPinCipher checks DPAPI access/purpose and performs a bounded
      // local probe. It does not ask for a PIN or contact the switch.
      return await this.cipher.available(source.keyReference);
    } catch {
      return false;
    }
  }
}
