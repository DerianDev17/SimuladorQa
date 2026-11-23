import type { Environment } from '../../../../packages/domain/src/index';
import type {
  SendConfigurationFile,
  SendConfigurationSnapshot,
} from '../../../../packages/domain/src/send-configuration';
import type { Result } from '../../../../packages/shared/src/contracts';

export interface SendConfigurationPort {
  read(environment: Environment): Promise<Result<SendConfigurationSnapshot>>;
  save(payload: unknown): Promise<Result<SendConfigurationSnapshot>>;
}

export interface SendConfigurationStore {
  read(): Promise<SendConfigurationFile>;
  write(configuration: SendConfigurationFile): Promise<void>;
}
