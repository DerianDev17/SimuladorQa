import type { DesktopApi } from '../../../../packages/shared/src/contracts';

declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}
