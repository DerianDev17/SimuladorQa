import type { CardApduSession } from '../../apps/desktop/src/main/adapters/emv-card-identity';
export const syntheticAid = Buffer.from([0xa0, 0, 0, 1, 1]);
export const syntheticPan = '4'.repeat(16);
export function tlv(tag: string, ...values: Uint8Array[]): Uint8Array {
  const value = Buffer.concat(values);
  return Buffer.concat([
    Buffer.from(tag, 'hex'),
    Buffer.from(value.length < 128 ? [value.length] : [0x81, value.length]),
    value,
  ]);
}
export function success(bytes: Uint8Array): Uint8Array {
  return Buffer.concat([bytes, Buffer.from([0x90, 0])]);
}
export function identityResponses(pdol = false): Uint8Array[] {
  return [
    success(
      tlv('6F', tlv('84', Buffer.from('1PAY.SYS.DDF01')), tlv('A5', tlv('88', Buffer.from([1])))),
    ),
    success(tlv('70', tlv('61', tlv('4F', syntheticAid), tlv('50', Buffer.from('QA CARD'))))),
    Buffer.from([0x6a, 0x83]),
    success(
      tlv(
        '6F',
        tlv('84', syntheticAid),
        tlv(
          'A5',
          tlv('50', Buffer.from('QA CARD')),
          ...(pdol ? [tlv('9F38', Buffer.from([0x9f, 0x1a, 2]))] : []),
        ),
      ),
    ),
    success(tlv('80', Buffer.from([0, 0, 0x10, 1, 1, 0]))),
    success(
      tlv(
        '70',
        tlv('5A', Buffer.from(syntheticPan, 'hex')),
        tlv('5F20', Buffer.from('QA TESTER')),
        tlv('5F24', Buffer.from('291231', 'hex')),
      ),
    ),
  ];
}
export function fakeCardSession(responses = identityResponses()) {
  const commands: Uint8Array[] = [];
  const state = { valid: true, closed: false, released: false };
  const queue = [...responses];
  const session: CardApduSession = {
    transmit: async (command) => {
      commands.push(command);
      const row = queue.shift();
      if (!row) throw Error('UNEXPECTED_COMMAND');
      return row;
    },
    releaseTransaction: async () => {
      state.released = true;
    },
    isValid: async () => state.valid,
    close: () => {
      state.closed = true;
    },
  };
  return { session, commands, state };
}
