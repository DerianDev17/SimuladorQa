// A bounded drain lets durable financial results finish before Electron exits.
// An unresolved request keeps its pre-send PENDING record for manual review.
export async function drainBeforeQuit(
  operations: readonly Promise<unknown>[],
  timeoutMs = 120_000,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.allSettled(operations).then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
