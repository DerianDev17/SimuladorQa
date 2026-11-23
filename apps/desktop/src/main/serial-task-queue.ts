// One queue per owner: failed work rejects its caller without blocking later work.
// A task must not await another task enqueued on the same queue (not reentrant).
export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
