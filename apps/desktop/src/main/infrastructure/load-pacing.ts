// The interval starts with the previous operation, not with its completion.
export function loadPacingDelay(
  sent: number,
  lastStartMs: number,
  nowMs: number,
  targetTps: number,
): number {
  return sent === 0 ? 0 : Math.max(0, lastStartMs + 1000 / targetTps - nowMs);
}
