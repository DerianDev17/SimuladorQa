// EMV 4.3 Book 3 §10.7. Null means confirmed absent; undefined is not evidence.
export interface EmvActionCodes {
  denial: string | null;
  online: string | null;
  default: string | null;
}
export interface EmvTerminalParameters {
  environment: 'QA';
  terminalCapabilities: string;
  terminalType: '14';
  additionalTerminalCapabilities: string;
  terminalActionCodes: EmvActionCodes;
}
export interface EmvTerminalDecision {
  requestedCryptogram: 'AAC' | 'ARQC';
  reason: 'DENIAL_ACTION_CODE' | 'ONLINE_ONLY_TERMINAL' | 'ONLINE_UNAVAILABLE';
}

function actionCode(value: unknown, absent: '00' | 'FF'): string {
  if (value === null) return absent.repeat(5);
  if (typeof value !== 'string' || !/^[A-F0-9]{10}$/.test(value))
    throw Error('EMV_ACTION_CODE_INVALID');
  return value;
}
function codes(
  value: EmvActionCodes,
  issuer: boolean,
): EmvActionCodes & {
  denial: string;
  online: string;
  default: string;
} {
  if (!value || typeof value !== 'object') throw Error('EMV_ACTION_CODE_INVALID');
  return {
    denial: actionCode(value.denial, '00'),
    online: actionCode(value.online, issuer ? 'FF' : '00'),
    default: actionCode(value.default, issuer ? 'FF' : '00'),
  };
}

// Limited to the supplied online-only ATM type 14 (Book 4 Annex A, Table 24).
// The caller supplies TVR computed by actual processing, never a captured TVR.
// This decision does not execute GENERATE AC or represent an issuer approval.
export function analyseQaOnlineAtm(input: {
  parameters: EmvTerminalParameters;
  tvr: string;
  issuerActionCodes: EmvActionCodes;
  phase: 'BEFORE_FIRST_AC' | 'AFTER_ONLINE_UNAVAILABLE';
}): EmvTerminalDecision {
  if (
    !input ||
    !input.parameters ||
    input.parameters.environment !== 'QA' ||
    input.parameters.terminalType !== '14'
  )
    throw Error('EMV_TERMINAL_PROFILE_UNSUPPORTED');
  if (typeof input.tvr !== 'string' || !/^[A-F0-9]{10}$/.test(input.tvr))
    throw Error('EMV_TVR_INVALID');
  if (!['BEFORE_FIRST_AC', 'AFTER_ONLINE_UNAVAILABLE'].includes(input.phase))
    throw Error('EMV_ANALYSIS_PHASE_INVALID');
  const terminal = codes(input.parameters.terminalActionCodes, false);
  const issuer = codes(input.issuerActionCodes, true);
  if (input.phase === 'AFTER_ONLINE_UNAVAILABLE') {
    // Book 3 §10.7 permits an online-only terminal to skip Default processing
    // and request AAC with its second GENERATE AC. This QA path chooses that option.
    return { requestedCryptogram: 'AAC', reason: 'ONLINE_UNAVAILABLE' };
  }
  for (let index = 0; index < 10; index += 2) {
    const tvr = Number.parseInt(input.tvr.slice(index, index + 2), 16);
    const denial =
      Number.parseInt(terminal.denial.slice(index, index + 2), 16) |
      Number.parseInt(issuer.denial.slice(index, index + 2), 16);
    if (tvr & denial) return { requestedCryptogram: 'AAC', reason: 'DENIAL_ACTION_CODE' };
  }
  return { requestedCryptogram: 'ARQC', reason: 'ONLINE_ONLY_TERMINAL' };
}
