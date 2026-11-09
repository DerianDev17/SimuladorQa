import { isRecord } from '../../../../packages/domain/src/index';
export interface Sender {
  senderId: number;
  frameIsMain: boolean;
  frameUrl: string | undefined;
}

export function isTrustedSender(sender: Sender, expectedId: number, expectedUrl: string): boolean {
  return sender.senderId === expectedId && sender.frameIsMain && sender.frameUrl === expectedUrl;
}

// The launcher supplies only a port, never a configurable renderer host or URL.
export function developmentRendererUrl(args: readonly string[]): string {
  const ports = args.filter((argument) => argument.startsWith('--dev-port='));
  const value = ports[0]?.slice('--dev-port='.length);
  if (ports.length !== 1 || !value || !/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65535)
    throw Error('DEV_PORT_INVALID');
  return `http://127.0.0.1:${value}/`;
}

// Historical PREPROD records remain readable, but cannot be selected through IPC.
export function hasUnsupportedEnvironment(payload: unknown): boolean {
  const contexts = [payload, isRecord(payload) ? payload.draft : undefined];
  return contexts.some(
    (context) =>
      isRecord(context) && Object.hasOwn(context, 'environment') && context.environment !== 'QA',
  );
}
