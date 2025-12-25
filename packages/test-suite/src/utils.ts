/**
 * Test utilities for waiting with early resolution
 */

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

/**
 * Creates a deferred promise that can be resolved/rejected externally
 */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Options for waitFor utility
 */
export interface WaitForOptions {
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Custom error message on timeout */
  timeoutMessage?: string;
}

/**
 * Waits for a condition to be met or times out.
 * Returns immediately when condition is satisfied.
 *
 * @example
 * ```ts
 * let value: string | null = null;
 * client.subscribe("config", (v) => { value = v; });
 *
 * await waitFor(() => value !== null, { timeout: 2000 });
 * expect(value).toBe("expected");
 * ```
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: WaitForOptions = {}
): Promise<void> {
  const { timeout = 5000, timeoutMessage = "waitFor timed out" } = options;

  const startTime = Date.now();

  while (true) {
    const result = await condition();
    if (result) return;

    if (Date.now() - startTime >= timeout) {
      throw new Error(timeoutMessage);
    }

    // Yield to event loop, check again soon
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * A signal that can be awaited and triggered.
 * Useful for waiting for async events in tests.
 *
 * @example
 * ```ts
 * const signal = createSignal<string>();
 *
 * client.subscribe("config", (value) => {
 *   signal.trigger(value);
 * });
 *
 * const value = await signal.wait({ timeout: 2000 });
 * expect(value).toBe("expected");
 * ```
 */
export interface Signal<T> {
  /** Wait for the signal to be triggered */
  wait(options?: WaitForOptions): Promise<T>;
  /** Trigger the signal with a value */
  trigger(value: T): void;
  /** Check if signal has been triggered */
  isTriggered(): boolean;
  /** Reset the signal to untriggered state */
  reset(): void;
  /** Get the triggered value (undefined if not triggered) */
  getValue(): T | undefined;
}

export function createSignal<T = void>(): Signal<T> {
  let deferred = createDeferred<T>();
  let triggered = false;
  let value: T | undefined;

  return {
    wait(options: WaitForOptions = {}) {
      const { timeout = 5000, timeoutMessage = "Signal wait timed out" } = options;

      return Promise.race([
        deferred.promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeout)),
      ]);
    },

    trigger(v: T) {
      if (!triggered) {
        triggered = true;
        value = v;
        deferred.resolve(v);
      }
    },

    isTriggered() {
      return triggered;
    },

    reset() {
      triggered = false;
      value = undefined;
      deferred = createDeferred<T>();
    },

    getValue() {
      return value;
    },
  };
}

/**
 * A collector that accumulates values and can wait for a specific count.
 * Useful for collecting multiple updates in tests.
 *
 * @example
 * ```ts
 * const collector = createCollector<string>();
 *
 * client.subscribe("config", (value) => {
 *   collector.push(value);
 * });
 *
 * // Wait for 3 updates
 * const values = await collector.waitForCount(3, { timeout: 5000 });
 * expect(values).toEqual(["v1", "v2", "v3"]);
 * ```
 */
export interface Collector<T> {
  /** Push a value to the collector */
  push(value: T): void;
  /** Get all collected values */
  getValues(): T[];
  /** Get the count of collected values */
  count(): number;
  /** Wait for at least N values to be collected */
  waitForCount(count: number, options?: WaitForOptions): Promise<T[]>;
  /** Wait for a value matching the predicate */
  waitFor(predicate: (value: T) => boolean, options?: WaitForOptions): Promise<T>;
  /** Clear all collected values */
  clear(): void;
}

export function createCollector<T>(): Collector<T> {
  const values: T[] = [];
  const listeners: Array<() => void> = [];

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    push(value: T) {
      values.push(value);
      notify();
    },

    getValues() {
      return [...values];
    },

    count() {
      return values.length;
    },

    async waitForCount(count: number, options: WaitForOptions = {}) {
      const { timeout = 5000, timeoutMessage = `Collector timed out waiting for ${count} values` } =
        options;

      if (values.length >= count) {
        return [...values];
      }

      return new Promise<T[]>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const idx = listeners.indexOf(listener);
          if (idx !== -1) listeners.splice(idx, 1);
          reject(new Error(timeoutMessage));
        }, timeout);

        const listener = () => {
          if (values.length >= count) {
            clearTimeout(timeoutId);
            const idx = listeners.indexOf(listener);
            if (idx !== -1) listeners.splice(idx, 1);
            resolve([...values]);
          }
        };

        listeners.push(listener);
      });
    },

    async waitFor(predicate: (value: T) => boolean, options: WaitForOptions = {}) {
      const { timeout = 5000, timeoutMessage = "Collector timed out waiting for matching value" } =
        options;

      // Check existing values first
      for (const v of values) {
        if (predicate(v)) return v;
      }

      return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const idx = listeners.indexOf(listener);
          if (idx !== -1) listeners.splice(idx, 1);
          reject(new Error(timeoutMessage));
        }, timeout);

        const listener = () => {
          // Check the latest value
          const latest = values[values.length - 1];
          if (latest !== undefined && predicate(latest)) {
            clearTimeout(timeoutId);
            const idx = listeners.indexOf(listener);
            if (idx !== -1) listeners.splice(idx, 1);
            resolve(latest);
          }
        };

        listeners.push(listener);
      });
    },

    clear() {
      values.length = 0;
    },
  };
}

/**
 * Delay for a specified time (use sparingly in tests)
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique test identifier
 */
export function uniqueId(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sync the edge replica with the database.
 * Requires TESTING_MODE=true on the server.
 *
 * This is useful in tests to ensure the edge replica has
 * received all config changes before making assertions.
 *
 * @param request - The request object containing the edge API base URL and admin API key
 * @param request.edgeApiBaseUrl - The base URL of the edge API (e.g., "http://localhost:8080")
 * @param request.adminApiKey - The admin API key
 */
export async function syncReplica(request: {
  edgeApiBaseUrl: string;
  sdkKey: string;
}): Promise<void> {
  const { edgeApiBaseUrl, sdkKey } = request;

  const response = await fetch(`${edgeApiBaseUrl}/api/sdk/v1/testing/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sdkKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to sync replica: ${response.status} ${body}`);
  }
}
