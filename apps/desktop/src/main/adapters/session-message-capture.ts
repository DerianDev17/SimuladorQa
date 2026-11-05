import type { BalanceExchangeRequest } from '../balance-ports';
import type { SessionIsoMessage } from '../../../../../packages/shared/src/session-messages';
import { CapturedVisaFraming } from '../infrastructure/captured-visa-framing';
import type { CapturedVisaBalance } from './captured-visa-balance';

export function captureSessionMessage(
  request: BalanceExchangeRequest,
  project: () => SessionIsoMessage | undefined,
): void {
  if (!request.onSessionMessage || request.environment !== 'QA') return;
  try {
    const message = project();
    if (message) request.onSessionMessage(message);
  } catch {
    /* Diagnostics must never change a financial result. */
  }
}

export function captureSessionRequest(
  request: BalanceExchangeRequest,
  codec: CapturedVisaBalance,
): void {
  if (!request.onSessionMessage) return;
  const decoder = new CapturedVisaFraming().decoder();
  let frames: ReturnType<typeof decoder.push> = [];
  captureSessionMessage(request, () => {
    try {
      frames = decoder.push(request.wire);
      decoder.finish();
      return frames.length === 1 ? codec.sessionMessage(frames[0]!.opaqueBody) : undefined;
    } finally {
      for (const frame of frames) {
        frame.opaqueBody.fill(0);
        frame.extension.fill(0);
      }
    }
  });
}
