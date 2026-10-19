import type { EmvTerminalParameters } from '../../../../../packages/domain/src/emv-terminal-analysis';

function octets(value: unknown, length: number): string {
  if (typeof value !== 'string') throw Error('EMV_TERMINAL_PARAMETER_INVALID');
  const text = value.toUpperCase();
  const hex = /^(?:\\[A-F0-9]{2})+$/.test(text) ? text.replaceAll('\\', '') : text;
  if (!new RegExp(`^[A-F0-9]{${length * 2}}$`).test(hex))
    throw Error('EMV_TERMINAL_PARAMETER_INVALID');
  return hex;
}
function optionalAction(value: unknown): string | null {
  return value === null ? null : octets(value, 5);
}

// Public terminal parameters only. No registry access, secrets, defaults for
// capabilities, or implicit live activation. Inputs come from a Main adapter.
export function parseQaEmvTerminalParameters(input: unknown): EmvTerminalParameters {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('EMV_TERMINAL_PARAMETER_INVALID');
  const row = input as Record<string, unknown>;
  const allowed = [
    'environment',
    'terminalCapabilities',
    'terminalType',
    'additionalTerminalCapabilities',
    'tacDenial',
    'tacOnline',
    'tacDefault',
  ];
  if (Object.keys(row).some((key) => !allowed.includes(key)) || row.environment !== 'QA')
    throw Error('EMV_TERMINAL_PARAMETER_INVALID');
  const terminalType = octets(row.terminalType, 1);
  if (terminalType !== '14') throw Error('EMV_TERMINAL_PROFILE_UNSUPPORTED');
  return {
    environment: 'QA',
    terminalType,
    terminalCapabilities: octets(row.terminalCapabilities, 3),
    additionalTerminalCapabilities: octets(row.additionalTerminalCapabilities, 5),
    terminalActionCodes: {
      denial: optionalAction(row.tacDenial),
      online: optionalAction(row.tacOnline),
      default: optionalAction(row.tacDefault),
    },
  };
}
