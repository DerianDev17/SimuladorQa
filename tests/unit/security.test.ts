import { describe, expect, it } from 'vitest';
import { isTrustedSender } from '../../apps/desktop/src/main/security';

describe('autorización de origen IPC', () => {
  const url = 'file:///app/index.html';
  it('acepta solo la ventana principal y su URL exacta', () => {
    expect(isTrustedSender({ senderId: 1, frameIsMain: true, frameUrl: url }, 1, url)).toBe(true);
  });
  it.each([
    { senderId: 2, frameIsMain: true, frameUrl: url },
    { senderId: 1, frameIsMain: false, frameUrl: url },
    { senderId: 1, frameIsMain: true, frameUrl: 'https://untrusted.invalid/' },
    { senderId: 1, frameIsMain: true, frameUrl: `${url}?injected=1` },
    { senderId: 1, frameIsMain: true, frameUrl: undefined },
  ])('rechaza otro origen o frame', (sender) => {
    expect(isTrustedSender(sender, 1, url)).toBe(false);
  });
});
