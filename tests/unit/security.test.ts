import { describe, expect, it } from 'vitest';
import { developmentRendererUrl, isTrustedSender } from '../../apps/desktop/src/main/security';

describe('origen local de desarrollo', () => {
  it('usa solo el puerto explícito y exige el mismo origen para IPC', () => {
    const url = developmentRendererUrl(['--dev', '--dev-port=49152']);
    expect(url).toBe('http://127.0.0.1:49152/');
    expect(isTrustedSender({ senderId: 1, frameIsMain: true, frameUrl: url }, 1, url)).toBe(true);
    expect(
      isTrustedSender(
        { senderId: 1, frameIsMain: true, frameUrl: 'http://127.0.0.1:49153/' },
        1,
        url,
      ),
    ).toBe(false);
  });
  it.each([
    '',
    '0',
    '65536',
    '-1',
    '1.2',
    '05173',
    '5173/path',
    '5173?x=1',
    '5173@remote.invalid',
    'http://remote.invalid',
    ' 5173',
  ])('rechaza un puerto inválido: %s', (value) => {
    expect(() => developmentRendererUrl([`--dev-port=${value}`])).toThrow('DEV_PORT_INVALID');
  });
  it('rechaza puerto ausente o duplicado', () => {
    expect(() => developmentRendererUrl(['--dev'])).toThrow('DEV_PORT_INVALID');
    expect(() => developmentRendererUrl(['--dev-port=5000', '--dev-port=5001'])).toThrow(
      'DEV_PORT_INVALID',
    );
  });
});

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
