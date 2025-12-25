import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDeferred,
  waitFor,
  createSignal,
  createCollector,
  delay,
  uniqueId,
} from "../src/utils";

describe("createDeferred", () => {
  it("should create a deferred with promise, resolve, and reject", () => {
    const deferred = createDeferred<string>();

    expect(deferred.promise).toBeInstanceOf(Promise);
    expect(typeof deferred.resolve).toBe("function");
    expect(typeof deferred.reject).toBe("function");
  });

  it("should resolve the promise when resolve is called", async () => {
    const deferred = createDeferred<string>();

    deferred.resolve("test-value");

    const result = await deferred.promise;
    expect(result).toBe("test-value");
  });

  it("should reject the promise when reject is called", async () => {
    const deferred = createDeferred<string>();

    deferred.reject(new Error("test-error"));

    await expect(deferred.promise).rejects.toThrow("test-error");
  });

  it("should work with void type", async () => {
    const deferred = createDeferred<void>();

    deferred.resolve();

    await expect(deferred.promise).resolves.toBeUndefined();
  });
});

describe("waitFor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should resolve immediately when condition is true", async () => {
    const promise = waitFor(() => true);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });

  it("should wait until condition becomes true", async () => {
    let condition = false;

    const promise = waitFor(() => condition, { timeout: 1000 });

    // Condition is false, should not resolve yet
    await vi.advanceTimersByTimeAsync(50);

    // Set condition to true
    condition = true;

    await vi.advanceTimersByTimeAsync(20);
    await expect(promise).resolves.toBeUndefined();
  });

  it("should timeout when condition never becomes true", async () => {
    const promise = waitFor(() => false, { timeout: 100 });

    // Catch the rejection before advancing time to prevent unhandled rejection
    const resultPromise = promise.catch((e) => e);

    await vi.advanceTimersByTimeAsync(150);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("waitFor timed out");
  });

  it("should use custom timeout message", async () => {
    const promise = waitFor(() => false, {
      timeout: 100,
      timeoutMessage: "Custom timeout message",
    });

    const resultPromise = promise.catch((e) => e);
    await vi.advanceTimersByTimeAsync(150);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Custom timeout message");
  });

  it("should work with async condition", async () => {
    let condition = false;

    const promise = waitFor(async () => {
      await Promise.resolve();
      return condition;
    }, { timeout: 1000 });

    await vi.advanceTimersByTimeAsync(50);
    condition = true;
    await vi.advanceTimersByTimeAsync(20);

    await expect(promise).resolves.toBeUndefined();
  });

  it("should use default timeout of 5000ms", async () => {
    const promise = waitFor(() => false);

    const resultPromise = promise.catch((e) => e);

    await vi.advanceTimersByTimeAsync(5100);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("waitFor timed out");
  });
});

describe("createSignal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a signal in untriggered state", () => {
    const signal = createSignal<string>();

    expect(signal.isTriggered()).toBe(false);
    expect(signal.getValue()).toBeUndefined();
  });

  it("should trigger with a value", () => {
    const signal = createSignal<string>();

    signal.trigger("test-value");

    expect(signal.isTriggered()).toBe(true);
    expect(signal.getValue()).toBe("test-value");
  });

  it("should resolve wait() when triggered", async () => {
    const signal = createSignal<string>();

    const promise = signal.wait({ timeout: 1000 });
    signal.trigger("test-value");

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("test-value");
  });

  it("should timeout if not triggered", async () => {
    const signal = createSignal<string>();

    const promise = signal.wait({ timeout: 100 });
    const resultPromise = promise.catch((e) => e);

    await vi.advanceTimersByTimeAsync(150);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Signal wait timed out");
  });

  it("should use custom timeout message", async () => {
    const signal = createSignal<string>();

    const promise = signal.wait({
      timeout: 100,
      timeoutMessage: "Custom signal timeout",
    });
    const resultPromise = promise.catch((e) => e);

    await vi.advanceTimersByTimeAsync(150);

    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Custom signal timeout");
  });

  it("should only trigger once (first value wins)", () => {
    const signal = createSignal<string>();

    signal.trigger("first");
    signal.trigger("second");

    expect(signal.getValue()).toBe("first");
  });

  it("should reset to untriggered state", () => {
    const signal = createSignal<string>();

    signal.trigger("test-value");
    expect(signal.isTriggered()).toBe(true);

    signal.reset();

    expect(signal.isTriggered()).toBe(false);
    expect(signal.getValue()).toBeUndefined();
  });

  it("should be retriggerable after reset", async () => {
    const signal = createSignal<string>();

    signal.trigger("first");
    const firstWait = signal.wait({ timeout: 100 });
    await vi.runAllTimersAsync();
    await expect(firstWait).resolves.toBe("first");

    signal.reset();

    const secondWait = signal.wait({ timeout: 1000 });
    signal.trigger("second");
    await vi.runAllTimersAsync();
    await expect(secondWait).resolves.toBe("second");
  });

  it("should work with void type", async () => {
    const signal = createSignal<void>();

    const promise = signal.wait({ timeout: 1000 });
    signal.trigger();

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });

  it("should resolve immediately if already triggered before wait", async () => {
    const signal = createSignal<string>();

    signal.trigger("test-value");
    const promise = signal.wait({ timeout: 100 });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("test-value");
  });
});

describe("createCollector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create an empty collector", () => {
    const collector = createCollector<string>();

    expect(collector.count()).toBe(0);
    expect(collector.getValues()).toEqual([]);
  });

  it("should push values", () => {
    const collector = createCollector<string>();

    collector.push("a");
    collector.push("b");
    collector.push("c");

    expect(collector.count()).toBe(3);
    expect(collector.getValues()).toEqual(["a", "b", "c"]);
  });

  it("should return a copy of values (not the original array)", () => {
    const collector = createCollector<string>();

    collector.push("a");
    const values = collector.getValues();
    values.push("b");

    expect(collector.getValues()).toEqual(["a"]);
  });

  it("should clear values", () => {
    const collector = createCollector<string>();

    collector.push("a");
    collector.push("b");
    collector.clear();

    expect(collector.count()).toBe(0);
    expect(collector.getValues()).toEqual([]);
  });

  describe("waitForCount", () => {
    it("should resolve immediately if count already reached", async () => {
      const collector = createCollector<string>();

      collector.push("a");
      collector.push("b");
      collector.push("c");

      const promise = collector.waitForCount(2, { timeout: 100 });
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toEqual(["a", "b", "c"]);
    });

    it("should wait until count is reached", async () => {
      const collector = createCollector<string>();

      const promise = collector.waitForCount(3, { timeout: 1000 });

      collector.push("a");
      await vi.advanceTimersByTimeAsync(10);

      collector.push("b");
      await vi.advanceTimersByTimeAsync(10);

      collector.push("c");
      await vi.advanceTimersByTimeAsync(10);

      await expect(promise).resolves.toEqual(["a", "b", "c"]);
    });

    it("should timeout if count not reached", async () => {
      const collector = createCollector<string>();

      const promise = collector.waitForCount(3, { timeout: 100 });
      const resultPromise = promise.catch((e) => e);

      collector.push("a");
      collector.push("b");

      await vi.advanceTimersByTimeAsync(150);

      const error = await resultPromise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Collector timed out waiting for 3 values");
    });

    it("should use custom timeout message", async () => {
      const collector = createCollector<string>();

      const promise = collector.waitForCount(3, {
        timeout: 100,
        timeoutMessage: "Custom collector timeout",
      });
      const resultPromise = promise.catch((e) => e);

      await vi.advanceTimersByTimeAsync(150);

      const error = await resultPromise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Custom collector timeout");
    });

    it("should resolve when count is reached even if more values come later", async () => {
      const collector = createCollector<string>();

      const promise = collector.waitForCount(2, { timeout: 1000 });

      collector.push("a");
      await vi.advanceTimersByTimeAsync(10);
      collector.push("b");
      await vi.advanceTimersByTimeAsync(10);

      // Promise should resolve with at least 2 values
      const result = await promise;
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.slice(0, 2)).toEqual(["a", "b"]);
    });
  });

  describe("waitFor (predicate)", () => {
    it("should resolve immediately if matching value exists", async () => {
      const collector = createCollector<number>();

      collector.push(1);
      collector.push(5);
      collector.push(10);

      const promise = collector.waitFor((v) => v > 7, { timeout: 100 });
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe(10);
    });

    it("should wait for matching value", async () => {
      const collector = createCollector<number>();

      const promise = collector.waitFor((v) => v > 5, { timeout: 1000 });

      collector.push(1);
      await vi.advanceTimersByTimeAsync(10);

      collector.push(3);
      await vi.advanceTimersByTimeAsync(10);

      collector.push(10);
      await vi.advanceTimersByTimeAsync(10);

      await expect(promise).resolves.toBe(10);
    });

    it("should timeout if no matching value", async () => {
      const collector = createCollector<number>();

      const promise = collector.waitFor((v) => v > 100, { timeout: 100 });
      const resultPromise = promise.catch((e) => e);

      collector.push(1);
      collector.push(2);
      collector.push(3);

      await vi.advanceTimersByTimeAsync(150);

      const error = await resultPromise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Collector timed out waiting for matching value");
    });

    it("should use custom timeout message", async () => {
      const collector = createCollector<number>();

      const promise = collector.waitFor((v) => v > 100, {
        timeout: 100,
        timeoutMessage: "Custom predicate timeout",
      });
      const resultPromise = promise.catch((e) => e);

      await vi.advanceTimersByTimeAsync(150);

      const error = await resultPromise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Custom predicate timeout");
    });

    it("should return the first matching value from existing values", async () => {
      const collector = createCollector<number>();

      collector.push(1);
      collector.push(10);
      collector.push(20);

      const promise = collector.waitFor((v) => v > 5, { timeout: 100 });
      await vi.runAllTimersAsync();

      // Should return first match (10), not latest (20)
      await expect(promise).resolves.toBe(10);
    });
  });
});

describe("delay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should resolve after specified time", async () => {
    const promise = delay(100);

    await vi.advanceTimersByTimeAsync(50);
    // Should not be resolved yet

    await vi.advanceTimersByTimeAsync(60);
    await expect(promise).resolves.toBeUndefined();
  });

  it("should work with 0ms delay", async () => {
    const promise = delay(0);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });
});

describe("uniqueId", () => {
  it("should generate unique ids", () => {
    const ids = new Set<string>();

    for (let i = 0; i < 100; i++) {
      ids.add(uniqueId());
    }

    expect(ids.size).toBe(100);
  });

  it("should use default prefix", () => {
    const id = uniqueId();
    expect(id).toMatch(/^test-\d+-[a-z0-9]+$/);
  });

  it("should use custom prefix", () => {
    const id = uniqueId("custom");
    expect(id).toMatch(/^custom-\d+-[a-z0-9]+$/);
  });

  it("should include timestamp", () => {
    const before = Date.now();
    const id = uniqueId();
    const after = Date.now();

    const parts = id.split("-");
    const timestamp = parseInt(parts[1], 10);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});
