import { expect, it, vi } from "vitest";
import { createReplaneClient } from "../src";

it("createReplaneClient.getConfig encodes name and handles text response", async () => {
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
  const value = await client.getConfig({ name: "space key", fallback: "FB" });
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
  const res = await client.getConfig({ name: "missing", fallback: "DEFAULT" });
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
  const res = await client.getConfig<typeof body>({
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
  const res = await client.getConfig<typeof fb>({
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

  const res = await client.getConfig({
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
  const res = await client.getConfig({
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
  const res = await client.getConfig({ name: "no-ct", fallback: "FB" });
  expect(res).toBe("hello");
});
