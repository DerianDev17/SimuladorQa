import type {
  AtmLocalInspection,
  InspectQaAtmRequest,
} from '../../../../packages/domain/src/atm-onboarding';
import type { Result } from '../../../../packages/shared/src/contracts';

export interface AtmInspectionPort {
  inspect(request: InspectQaAtmRequest): Promise<Result<AtmLocalInspection>>;
}
export interface AtmConfigurationInspectionPort {
  inspectLocal(
    request: InspectQaAtmRequest,
    endpoint: { host: string; port: number },
  ): Promise<{
    source: 'SPECIFIC' | 'ATM20521';
    sequencesRemaining: number;
    securityAvailable: boolean;
  }>;
}
