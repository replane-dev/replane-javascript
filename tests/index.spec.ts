import { expect, it, vi, describe } from "vitest";
import { createReplaneClient } from "../src";

it("createReplaneClient.getConfigValue encodes name and handles text response", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response("raw-value", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
  ) as any;

  const client = createReplaneClient({
    apiKey: "TKN",
    baseUrl: "https://api.local",
    fetchFn: fetchMock,
  });
  const value = await client.getConfigValue({
    name: "space key",
    fallback: "FB",
  });
  expect(value).toBe("raw-value");
  const callUrl = fetchMock.mock.calls[0][0];
  expect(callUrl).toBe("https://api.local/api/v1/configs/space%20key/value");
});

it("non-OK responses return fallback and log error with status & body", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
  ) as any;
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };
  const client = createReplaneClient({
    apiKey: "TKN",
    baseUrl: "https://api.local",
    fetchFn: fetchMock,
    logger,
  });
  const res = await client.getConfigValue({
    name: "missing",
    fallback: "DEFAULT",
  });
  expect(res).toBe("DEFAULT");
  expect(logger.error).toHaveBeenCalledWith(
    "ReplaneClient.getConfig error",
    expect.objectContaining({
      name: "missing",
      status: 404,
      body: { error: "not found" },
    })
  );
});

it("parses JSON response body on 200 application/json", async () => {
  const body = { value: 42, nested: { ok: true } };
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  ) as any;

  const client = createReplaneClient({
    apiKey: "TKN",
    baseUrl: "https://api.local",
    fetchFn: fetchMock,
  });
  const res = await client.getConfigValue<typeof body>({
    name: "json-config",
    fallback: { value: 0, nested: { ok: false } },
  });
  expect(res).toEqual(body);
});

it("invalid JSON on 200 returns fallback and logs invalid response", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response("{not-valid-json}", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  ) as any;
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };
  const client = createReplaneClient({
    apiKey: "TKN",
    baseUrl: "https://api.local",
    fetchFn: fetchMock,
    logger,
  });
  const fb = { v: 1 };
  const res = await client.getConfigValue<typeof fb>({
    name: "bad-json",
    fallback: fb,
  });
  expect(res).toBe(fb);
  expect(logger.error).toHaveBeenCalledWith(
    "ReplaneClient.getConfig invalid response",
    expect.objectContaining({
      name: "bad-json",
      status: 200,
      contentType: "application/json",
    })
  );
});

it("uses per-call overrides for baseUrl/apiKey and sets headers", async () => {
  const fetchMock = vi.fn(async (_input: any, init: RequestInit) => {
    expect(init?.method).toBe("GET");
    // Headers may be Headers object; normalize
    const headers = new Headers(init?.headers as any);
    expect(headers.get("authorization")).toBe("Bearer OVERRIDE");
    expect(headers.get("accept")).toBe(
      "application/json, text/plain;q=0.9, */*;q=0.8"
    );
    return new Response("ok", { status: 200 });
  }) as any;

  const client = createReplaneClient({
    apiKey: "BASE",
    baseUrl: "https://api.local/", // trailing slash should be trimmed
    fetchFn: fetchMock,
  });

  const res = await client.getConfigValue({
    name: "x/y",
    fallback: "FB",
    baseUrl: "https://override",
    apiKey: "OVERRIDE",
  });
  expect(res).toBe("ok");
  const callUrl = fetchMock.mock.calls[0][0];
  expect(callUrl).toBe("https://override/api/v1/configs/x%2Fy/value");
});

it("aborts on timeout and returns fallback with error logged", async () => {
  const fetchMock = vi.fn(async (_input: any, init: any) => {
    return new Promise((_resolve, reject) => {
      const signal: AbortSignal | undefined = init?.signal;
      // Simulate a long request that rejects when aborted
      signal?.addEventListener("abort", () => {
        reject(new Error("Aborted"));
      });
    });
  }) as any;
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };
  const client = createReplaneClient({
    apiKey: "TKN",
    baseUrl: "https://api.local",
    fetchFn: fetchMock,
    logger,
  });
  const res = await client.getConfigValue({
    name: "slow",
    fallback: "FB",
    timeoutMs: 10,
  });
  expect(res).toBe("FB");
  expect(logger.error).toHaveBeenCalled();
});

it("throws on missing apiKey when creating client", () => {
  expect(() =>
    createReplaneClient({ apiKey: "", baseUrl: "https://api.local" })
  ).toThrowError(/API key is required/);
});

it("treats missing content-type as text and returns body", async () => {
  const fetchMock = vi.fn(
    async () => new Response("hello", { status: 200, headers: {} })
  ) as any;
  const client = createReplaneClient({
    apiKey: "TKN",
    baseUrl: "https://api.local",
    fetchFn: fetchMock,
  });
  const res = await client.getConfigValue({ name: "no-ct", fallback: "FB" });
  expect(res).toBe("hello");
});

it("throws when config name missing", async () => {
  const client = createReplaneClient({
    apiKey: "TKN",
    baseUrl: "https://api.local",
    fetchFn: vi.fn(async () => new Response("ok", { status: 200 })),
  });
  // @ts-expect-error intentionally missing name
  await expect(client.getConfigValue({ fallback: "FB" })).rejects.toThrow(
    /config name is required/
  );
});

describe("watchConfigValue", () => {
  it("initially returns first fetched value and updates on interval", async () => {
    vi.useFakeTimers();
    const values = ["v1", "v2", "v3"];
    let i = 0;
    const fetchMock = vi.fn(
      async () =>
        new Response(values[i++], {
          status: 200,
          headers: { "content-type": "text/plain" },
        })
    );
    const client = createReplaneClient({
      apiKey: "TKN",
      baseUrl: "https://api.local",
      fetchFn: fetchMock as any,
    });
    const watcher = await client.watchConfigValue<string>({
      name: "watched",
      fallback: "FB",
    });
    expect(watcher.get()).toBe("v1");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(watcher.get()).toBe("v2");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(watcher.get()).toBe("v3");

    watcher.close();
    vi.useRealTimers();
  });

  it("watcher.get throws after close and close is idempotent", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response("v1", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })
    );
    const client = createReplaneClient({
      apiKey: "TKN",
      baseUrl: "https://api.local",
      fetchFn: fetchMock as any,
    });
    const watcher = await client.watchConfigValue<string>({
      name: "watched",
      fallback: "FB",
    });
    expect(watcher.get()).toBe("v1");
    watcher.close();
    watcher.close(); // idempotent
    expect(() => watcher.get()).toThrow(/watcher is closed/);
    vi.useRealTimers();
  });

  it("client.close closes all watchers and prevents further calls", async () => {
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(
      async () =>
        new Response(`val-${++call}`, {
          status: 200,
          headers: { "content-type": "text/plain" },
        })
    );
    const client = createReplaneClient({
      apiKey: "TKN",
      baseUrl: "https://api.local",
      fetchFn: fetchMock as any,
    });
    const w1 = await client.watchConfigValue<string>({
      name: "a",
      fallback: "FA",
    });
    const w2 = await client.watchConfigValue<string>({
      name: "b",
      fallback: "FB",
    });
    expect(w1.get()).toMatch(/val-\d+/);
    expect(w2.get()).toMatch(/val-\d+/);

    client.close();
    expect(() => w1.get()).toThrow(/closed/);
    expect(() => w2.get()).toThrow(/closed/);
    await expect(
      client.getConfigValue({ name: "x", fallback: "F" })
    ).rejects.toThrow(/client is closed/);
    await expect(
      client.watchConfigValue({ name: "y", fallback: "F" })
    ).rejects.toThrow(/client is closed/);

    const callCountBefore = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    // No further polling after close
    expect(fetchMock.mock.calls.length).toBe(callCountBefore);
    // Idempotent close
    client.close();
    vi.useRealTimers();
  });
});
