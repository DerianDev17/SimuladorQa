import type { Environment } from '../../../../packages/domain/src/index';
import type { EnvironmentAudit } from '../../../../packages/shared/src/contracts';

export interface Preferences {
  version: 1;
  environment: Environment;
  audit: EnvironmentAudit[];
}

export interface PreferencesStore {
  read(): Promise<Preferences>;
  write(preferences: Preferences): Promise<void>;
}

export interface RuntimeIdentity {
  agentId: string;
  hostname: string;
  user: string;
  version: string;
  uuid(): string;
  now(): string;
}
