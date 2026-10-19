import type { SendConfigurationFile } from '../../../../packages/domain/src/send-configuration';
export interface SendConfigurationStore {
  read(): Promise<SendConfigurationFile>;
  write(configuration: SendConfigurationFile): Promise<void>;
}
