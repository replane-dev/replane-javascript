/**
 * Returns a promise that resolves after the specified delay
 *
 * @param ms - Delay in milliseconds
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a promise that resolves after a delay with jitter.
 * The actual delay is the average delay ± 10% (jitter = averageDelay/5).
 *
 * @param averageDelay - The average delay in milliseconds
 */
export async function retryDelay(averageDelay: number): Promise<void> {
  const jitter = averageDelay / 5;
  const delayMs = averageDelay + Math.random() * jitter - jitter / 2;

  await delay(delayMs);
}

/**
 * Combines multiple abort signals into one.
 * When any of the input signals is aborted, the combined signal will also be aborted.
 *
 * @param signals - Array of AbortSignal instances (can contain undefined/null)
 * @returns An object containing the combined signal and a cleanup function
 */
export function combineAbortSignals(signals: Array<AbortSignal | undefined | null>): {
  signal: AbortSignal;
  cleanUpSignals: () => void;
} {
  const controller = new AbortController();
  const onAbort = () => {
    controller.abort();
    cleanUpSignals();
  };

  const cleanUpSignals = () => {
    for (const s of signals) {
      s?.removeEventListener("abort", onAbort);
    }
  };

  for (const s of signals) {
    s?.addEventListener("abort", onAbort, { once: true });
  }

  if (signals.some((s) => s?.aborted)) {
    onAbort();
  }

  return { signal: controller.signal, cleanUpSignals };
}

/**
 * A deferred promise that can be resolved or rejected from outside.
 * Useful for coordinating async operations.
 */
export class Deferred<T> {
  public readonly promise: Promise<T>;
  public resolve!: (value: T) => void;
  public reject!: (error: unknown) => void;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
