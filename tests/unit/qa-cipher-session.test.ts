import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QaCipherSession } from '../../apps/desktop/src/main/adapters/qa-cipher-session';
import { WindowsQaPinCipher } from '../../apps/desktop/src/main/adapters/qa-pin-cipher';
import { randomUUID } from 'node:crypto';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
function fixture() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  mocks.spawn.mockReturnValue(child);
  return {
    child,
    session: new QaCipherSession('helper', 'directory', randomUUID()),
    signal: new AbortController().signal,
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe('proceso privado de cifrado reutilizable', () => {
  it('serializa comandos y acepta respuestas fragmentadas sin lanzar otro proceso', async () => {
    const f = fixture();
    const first = f.session.encrypt(Buffer.alloc(8), f.signal);
    const second = f.session.encrypt(Buffer.alloc(8, 1), f.signal);
    await Promise.resolve();
    expect(f.child.stdin.read()?.toString()).toBe('00'.repeat(8) + '\n');
    f.child.stdout.write('01234567');
    f.child.stdout.write('89ABCDEF\r\n');
    const output = await first;
    expect(output).toEqual(Buffer.from('0123456789ABCDEF', 'hex'));
    await Promise.resolve();
    expect(f.child.stdin.read()?.toString()).toBe('01'.repeat(8) + '\n');
    f.child.stdout.write('FEDCBA9876543210\n');
    (await second).fill(0);
    output.fill(0);
    expect(mocks.spawn).toHaveBeenCalledOnce();
    f.session.close();
    expect(f.child.kill).toHaveBeenCalledOnce();
  });
  it.each(['X'.repeat(40), 'PRIVATE\n', '0123456789ABCDEF\n0123456789ABCDEF\n'])(
    'rechaza salida inválida sin exponerla: %s',
    async (text) => {
      const f = fixture();
      const result = expect(f.session.encrypt(Buffer.alloc(8), f.signal)).rejects.toThrow(
        'QA_PIN_UNAVAILABLE',
      );
      await Promise.resolve();
      f.child.stdout.write(text);
      await result;
      expect(f.child.kill).toHaveBeenCalledOnce();
    },
  );
  it.each(['timeout', 'cancel', 'exit'] as const)(
    'cierra operación y cola ante %s sin reintentar',
    async (reason) => {
      vi.useFakeTimers();
      const f = fixture(),
        controller = new AbortController();
      const pending = [
        expect(f.session.encrypt(Buffer.alloc(8), controller.signal)).rejects.toThrow(
          'QA_PIN_UNAVAILABLE',
        ),
        expect(f.session.encrypt(Buffer.alloc(8), f.signal)).rejects.toThrow('QA_PIN_UNAVAILABLE'),
      ];
      await Promise.resolve();
      if (reason === 'timeout') await vi.advanceTimersByTimeAsync(5000);
      if (reason === 'cancel') controller.abort();
      if (reason === 'exit') f.child.emit('close', 1);
      await Promise.all(pending);
      expect(mocks.spawn).toHaveBeenCalledOnce();
      expect(f.child.kill).toHaveBeenCalledOnce();
    },
  );
  it('valida bloque y referencia antes de crear un helper', async () => {
    const cipher = new WindowsQaPinCipher('helper', 'directory');
    cipher.begin();
    await expect(
      cipher.encrypt(Buffer.alloc(7), randomUUID(), new AbortController().signal),
    ).rejects.toThrow();
    await expect(
      cipher.encrypt(Buffer.alloc(8), 'invalid', new AbortController().signal),
    ).rejects.toThrow();
    expect(mocks.spawn).not.toHaveBeenCalled();
    cipher.end();
  });
});
