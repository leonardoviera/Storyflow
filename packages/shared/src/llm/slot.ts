// One LLM request in flight per process (R7, FR-032). The pipeline worker runs as a single
// replica, so this FIFO mutex is enough to serialize script generation, writing and breakdowns.

let tail: Promise<unknown> = Promise.resolve();

export function withLlmSlot<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  // The next caller waits for this one to settle, whether it resolved or threw.
  tail = run.catch(() => undefined);
  return run;
}
