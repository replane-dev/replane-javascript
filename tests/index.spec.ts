import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createInMemoryReplaneClient,
  createReplaneClient,
  ReplaneError,
  type ReplaneClient,
} from "../src";

type Fetch = (input: any, init?: RequestInit) => Promise<any>;

function responseOK(jsonValue: any) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => jsonValue,
    text: async () => JSON.stringify(jsonValue),
  };
}

function responseError(status: number, statusText = "ERR", body = "error") {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({ error: body }),
    text: async () => String(body),
  };
}

function makeSequenceFetch(
  responses: Array<() => any>
): Fetch & { calls: number } {
  const fn: any = async () => {
    const idx = fn.calls++;
    const resFactory = responses[Math.min(idx, responses.length - 1)];
    const res = resFactory();
    if (res instanceof Error) throw res;
    return res;
  };
  fn.calls = 0;
  return fn;
}

function makeTimeoutFetch(): Fetch & { calls: number } {
  const fn: any = (input: any, init?: RequestInit) => {
    fn.calls++;
    const signal = init?.signal as AbortSignal | undefined;
    return new Promise((_resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }
      const onAbort = () => reject(new Error("aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
      // Never resolve; will be aborted by timeout
    });
  };
  fn.calls = 0;
  return fn;
}

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("ReplaneError", () => {
  it("has correct name", () => {
    const err = new ReplaneError("boom");
    expect(err.name).toBe("ReplaneError");
    expect(err.message).toBe("boom");
  });
});

describe("In-memory client", () => {
  it("returns stored values", async () => {
    const client = createInMemoryReplaneClient({ a: 1, b: "x" });
    await expect(client.getConfigValue<number>("a")).resolves.toBe(1);
    await expect(client.getConfigValue<string>("b")).resolves.toBe("x");
  });

  it("throws ReplaneError when config missing", async () => {
    const client = createInMemoryReplaneClient({});
    await expect(client.getConfigValue("missing")).rejects.toMatchObject({
      name: "ReplaneError",
      message: "Config not found: missing",
    });
  });

  it("watcher returns initial value and then closes", async () => {
    const client = createInMemoryReplaneClient({ feature: true });
    const watcher = await client.watchConfigValue<boolean>("feature");
    expect(watcher.get()).toBe(true);
    watcher.close();
    expect(() => watcher.get()).toThrowError("Config value watcher is closed");
  });

  it("client.close prevents further operations and closes watchers", async () => {
    const client = createInMemoryReplaneClient({ k: 42 });
    const watcher = await client.watchConfigValue<number>("k");
    expect(watcher.get()).toBe(42);
    client.close();
    expect(() => watcher.get()).toThrowError("Config value watcher is closed");
    await expect(client.getConfigValue("k")).rejects.toThrow(
      "Replane client is closed"
    );
    await expect(client.watchConfigValue("k")).rejects.toThrow(
      "Replane client is closed"
    );
  });
});

describe("Remote client - fetch basics", () => {
  it("builds correct URL, headers, and returns JSON value", async () => {
    const fetch = vi.fn<Fetch>().mockResolvedValue(responseOK({ value: 123 }));
    const client = createReplaneClient({
      apiKey: "abc",
      baseUrl: "https://api.example.com/", // trailing slash should be trimmed
      fetchFn: fetch as unknown as typeof fetch,
      timeoutMs: 1000,
    });

    const value = await client.getConfigValue<{ value: number }>(
      "my cfg with spaces"
    );
    expect(value).toEqual({ value: 123 });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0];
    expect(String(input)).toBe(
      "https://api.example.com/api/v1/configs/my%20cfg%20with%20spaces/value"
    );
    expect(init?.method).toBe("GET");
    // @ts-expect-error
    expect(init?.headers?.Authorization).toBe("Bearer abc");
  });

  it("throws ReplaneError for 404", async () => {
    const fetch = vi
      .fn<Fetch>()
      .mockResolvedValue(responseError(404, "Not Found"));
    const client = createReplaneClient({
      apiKey: "key",
      baseUrl: "https://host",
      fetchFn: fetch as unknown as typeof fetch,
      retries: 0,
    });
    await expect(client.getConfigValue("unknown")).rejects.toMatchObject({
      name: "ReplaneError",
      message: "Config not found: unknown",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx and eventually succeeds", async () => {
    vi.useFakeTimers();
    const logger = makeLogger();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // deterministic retry delay = base
    const fetch = makeSequenceFetch([
      () => responseError(500, "ISE", "err1"),
      () => responseError(502, "BG", "err2"),
      () => responseOK({ ok: true }),
    ]);
    const client = createReplaneClient({
      apiKey: "x",
      baseUrl: "https://h",
      fetchFn: fetch as unknown as typeof fetch,
      retries: 2,
      retryDelayMs: 200,
      logger,
    });

    const p = client.getConfigValue("cfg");
    // Advance through two retry delays
    await vi.advanceTimersByTimeAsync(200 * 2);
    await expect(p).resolves.toEqual({ ok: true });
    expect(fetch.calls).toBe(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    (Math.random as any).mockRestore?.();
  });

  it("wraps network errors and retries", async () => {
    vi.useFakeTimers();
    const logger = makeLogger();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fetch = makeSequenceFetch([
      () => new Error("boom"),
      () => responseOK(7),
    ]);
    const client = createReplaneClient({
      apiKey: "x",
      baseUrl: "https://h",
      fetchFn: fetch as unknown as typeof fetch,
      retries: 1,
      retryDelayMs: 100,
      logger,
    });
    const p = client.getConfigValue("cfg");
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(7);
    expect(fetch.calls).toBe(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    (Math.random as any).mockRestore?.();
  });

  it("aborts long fetch by timeout and errors", async () => {
    vi.useFakeTimers();
    const fetch = makeTimeoutFetch();
    const client = createReplaneClient({
      apiKey: "k",
      baseUrl: "https://h",
      fetchFn: fetch as unknown as typeof fetch,
      timeoutMs: 100,
      retries: 0,
    });
    const p = client.getConfigValue("slow");
    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const rejection = expect(p).rejects.toMatchObject({ name: "ReplaneError" });
    await vi.advanceTimersByTimeAsync(120);
    await rejection;
    expect(fetch.calls).toBe(1);
    vi.useRealTimers();
  });
});

describe("Option merging and overrides", () => {
  it("per-call options override client defaults", async () => {
    const fetch = vi.fn<Fetch>().mockResolvedValue(responseOK("ok"));
    const client = createReplaneClient({
      apiKey: "A",
      baseUrl: "https://a.example",
      fetchFn: fetch as unknown as typeof fetch,
    });

    await client.getConfigValue("x", {
      apiKey: "B",
      baseUrl: "https://b.example/",
      fetchFn: fetch as unknown as typeof fetch,
    });

    const [input, init] = fetch.mock.calls[0];
    expect(String(input)).toBe("https://b.example/api/v1/configs/x/value");
    // @ts-expect-error
    expect(init?.headers?.Authorization).toBe("Bearer B");
  });

  it("requires apiKey (throws on falsy)", () => {
    expect(() =>
      createReplaneClient({ apiKey: "", baseUrl: "https://h" })
    ).toThrowError("API key is required");
  });
});

describe("Watcher behavior (remote)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls every 60s and updates value", async () => {
    const fetch = makeSequenceFetch([
      () => responseOK("v1"),
      () => responseOK("v2"),
      () => responseOK("v3"),
    ]);
    const client = createReplaneClient({
      apiKey: "k",
      baseUrl: "https://h",
      fetchFn: fetch as unknown as typeof fetch,
    });
    const watcher = await client.watchConfigValue<string>("cfg");
    expect(fetch.calls).toBe(1);
    expect(watcher.get()).toBe("v1");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch.calls).toBe(2);
    expect(watcher.get()).toBe("v2");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch.calls).toBe(3);
    expect(watcher.get()).toBe("v3");

    watcher.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch.calls).toBe(3); // no more polling
    expect(() => watcher.get()).toThrowError("Config value watcher is closed");
  });
});
