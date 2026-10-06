export interface Sender {
  senderId: number;
  frameIsMain: boolean;
  frameUrl: string | undefined;
}

export function isTrustedSender(sender: Sender, expectedId: number, expectedUrl: string): boolean {
  return sender.senderId === expectedId && sender.frameIsMain && sender.frameUrl === expectedUrl;
}
