import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getReplaneSnapshot, getConfig } from "../src/server";
import type { ReplaneClient, ReplaneSnapshot } from "@replanejs/sdk";
import * as sdk from "@replanejs/sdk";

// ============================================================================
// Test Utilities
// ============================================================================

function createMockSnapshot<T extends object>(configs: T): ReplaneSnapshot<T> {
  return {
    configs: Object.entries(configs).map(([name, value]) => ({
      name,
      value,
      overrides: [],
    })),
  };
}

function createMockClient(
  configs: Record<string, unknown> = {}
): ReplaneClient<Record<string, unknown>> {
  const snapshot = createMockSnapshot(configs);

  return {
    get: vi.fn((name: string) => configs[name]),
    subscribe: vi.fn(() => () => {}),
    close: vi.fn(),
    getSnapshot: vi.fn(() => snapshot),
  } as unknown as ReplaneClient<Record<string, unknown>>;
}

// ============================================================================
// getReplaneSnapshot - Basic Functionality
// ============================================================================

describe("getReplaneSnapshot - Basic Functionality", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true, count: 42 });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);
  });

  afterEach(() => {
    mockCreateClient.mockRestore();
  });

  it("returns snapshot from created client", async () => {
    const snapshot = await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(snapshot).toBeDefined();
    expect(snapshot.configs).toHaveLength(2);
    expect(mockClient.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("calls createReplaneClient with correct options", async () => {
    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(mockCreateClient).toHaveBeenCalledWith({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      fetchFn: undefined,
      requestTimeoutMs: undefined,
      initializationTimeoutMs: undefined,
      context: undefined,
      required: undefined,
      fallbacks: undefined,
    });
  });

  it("closes client after getting snapshot", async () => {
    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });

  it("closes client even if getSnapshot throws", async () => {
    const error = new Error("Snapshot error");
    vi.mocked(mockClient.getSnapshot).mockImplementation(() => {
      throw error;
    });

    await expect(
      getReplaneSnapshot({
        baseUrl: "https://api.replane.dev",
        sdkKey: "rp_test_key",
      })
    ).rejects.toThrow("Snapshot error");

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// getReplaneSnapshot - Options
// ============================================================================

describe("getReplaneSnapshot - Options", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);
  });

  afterEach(() => {
    mockCreateClient.mockRestore();
  });

  it("passes custom fetch function", async () => {
    const customFetch = vi.fn();

    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      fetchFn: customFetch,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchFn: customFetch,
      })
    );
  });

  it("passes request timeout", async () => {
    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      requestTimeoutMs: 5000,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        requestTimeoutMs: 5000,
      })
    );
  });

  it("passes initialization timeout", async () => {
    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      initializationTimeoutMs: 10000,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        initializationTimeoutMs: 10000,
      })
    );
  });

  it("passes context for override evaluation", async () => {
    const context = { userId: "123", plan: "premium" };

    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      context,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { userId: "123", plan: "premium" },
      })
    );
  });

  it("passes required configs", async () => {
    const required = ["feature", "count"];

    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      required,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        required: ["feature", "count"],
      })
    );
  });

  it("passes required configs as object", async () => {
    const required = { feature: true, count: 0 };

    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      required,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        required: { feature: true, count: 0 },
      })
    );
  });

  it("passes fallback values", async () => {
    const fallbacks = { feature: false, count: 0 };

    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      fallbacks,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbacks: { feature: false, count: 0 },
      })
    );
  });

  it("passes all options together", async () => {
    const customFetch = vi.fn();
    const context = { userId: "123" };
    const required = ["feature"];
    const fallbacks = { feature: false };

    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      fetchFn: customFetch,
      requestTimeoutMs: 3000,
      initializationTimeoutMs: 8000,
      context,
      required,
      fallbacks,
    });

    expect(mockCreateClient).toHaveBeenCalledWith({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      fetchFn: customFetch,
      requestTimeoutMs: 3000,
      initializationTimeoutMs: 8000,
      context,
      required,
      fallbacks,
    });
  });
});

// ============================================================================
// getReplaneSnapshot - Error Handling
// ============================================================================

describe("getReplaneSnapshot - Error Handling", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    mockCreateClient?.mockRestore();
  });

  it("propagates errors from createReplaneClient", async () => {
    const error = new Error("Network error");
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue(error);

    await expect(
      getReplaneSnapshot({
        baseUrl: "https://api.replane.dev",
        sdkKey: "rp_test_key",
      })
    ).rejects.toThrow("Network error");
  });

  it("propagates timeout errors", async () => {
    const error = new Error("Initialization timeout");
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue(error);

    await expect(
      getReplaneSnapshot({
        baseUrl: "https://api.replane.dev",
        sdkKey: "rp_test_key",
        initializationTimeoutMs: 1000,
      })
    ).rejects.toThrow("Initialization timeout");
  });

  it("handles missing required configs error", async () => {
    const error = new Error("Missing required configs: feature, count");
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue(error);

    await expect(
      getReplaneSnapshot({
        baseUrl: "https://api.replane.dev",
        sdkKey: "rp_test_key",
        required: ["feature", "count"],
      })
    ).rejects.toThrow("Missing required configs");
  });

  it("handles authentication errors", async () => {
    const error = new Error("Invalid SDK key");
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue(error);

    await expect(
      getReplaneSnapshot({
        baseUrl: "https://api.replane.dev",
        sdkKey: "invalid_key",
      })
    ).rejects.toThrow("Invalid SDK key");
  });
});

// ============================================================================
// getReplaneSnapshot - Snapshot Content
// ============================================================================

describe("getReplaneSnapshot - Snapshot Content", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    mockCreateClient?.mockRestore();
  });

  it("returns snapshot with all config values", async () => {
    const mockClient = createMockClient({
      feature: true,
      count: 42,
      message: "Hello",
      nested: { deep: "value" },
    });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const snapshot = await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(snapshot.configs).toHaveLength(4);
    expect(snapshot.configs.find((c) => c.name === "feature")?.value).toBe(true);
    expect(snapshot.configs.find((c) => c.name === "count")?.value).toBe(42);
    expect(snapshot.configs.find((c) => c.name === "message")?.value).toBe("Hello");
    expect(snapshot.configs.find((c) => c.name === "nested")?.value).toEqual({
      deep: "value",
    });
  });

  it("returns snapshot with empty configs", async () => {
    const mockClient = createMockClient({});
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const snapshot = await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(snapshot.configs).toHaveLength(0);
  });

  it("returns snapshot with null and undefined values", async () => {
    const mockClient = createMockClient({
      nullConfig: null,
      undefinedConfig: undefined,
    });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const snapshot = await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(snapshot.configs.find((c) => c.name === "nullConfig")?.value).toBe(null);
    expect(
      snapshot.configs.find((c) => c.name === "undefinedConfig")?.value
    ).toBe(undefined);
  });

  it("returns snapshot with boolean false and number zero", async () => {
    const mockClient = createMockClient({
      disabled: false,
      zero: 0,
    });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const snapshot = await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(snapshot.configs.find((c) => c.name === "disabled")?.value).toBe(false);
    expect(snapshot.configs.find((c) => c.name === "zero")?.value).toBe(0);
  });
});

// ============================================================================
// getReplaneSnapshot - TypeScript Types
// ============================================================================

describe("getReplaneSnapshot - TypeScript Types", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true, count: 42 });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);
  });

  afterEach(() => {
    mockCreateClient.mockRestore();
  });

  it("accepts generic type parameter", async () => {
    interface MyConfigs {
      feature: boolean;
      count: number;
    }

    const snapshot = await getReplaneSnapshot<MyConfigs>({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    // Type check: snapshot should have the correct type
    expect(snapshot).toBeDefined();
    expect(snapshot.configs).toBeDefined();
  });

  it("infers type from required configs object", async () => {
    const snapshot = await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      required: { feature: true, count: 0 },
    });

    expect(snapshot).toBeDefined();
  });
});

// ============================================================================
// getConfig - Basic Functionality
// ============================================================================

describe("getConfig - Basic Functionality", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true, count: 42 });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);
  });

  afterEach(() => {
    mockCreateClient.mockRestore();
  });

  it("returns single config value", async () => {
    const value = await getConfig<boolean>({
      name: "feature",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toBe(true);
    expect(mockClient.get).toHaveBeenCalledWith("feature", { context: undefined });
  });

  it("calls createReplaneClient with correct options", async () => {
    await getConfig({
      name: "feature",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(mockCreateClient).toHaveBeenCalledWith({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      fetchFn: undefined,
      requestTimeoutMs: undefined,
      initializationTimeoutMs: undefined,
      context: undefined,
    });
  });

  it("closes client after getting config", async () => {
    await getConfig({
      name: "feature",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });

  it("closes client even if get throws", async () => {
    const error = new Error("Get error");
    vi.mocked(mockClient.get).mockImplementation(() => {
      throw error;
    });

    await expect(
      getConfig({
        name: "feature",
        baseUrl: "https://api.replane.dev",
        sdkKey: "rp_test_key",
      })
    ).rejects.toThrow("Get error");

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// getConfig - Options
// ============================================================================

describe("getConfig - Options", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);
  });

  afterEach(() => {
    mockCreateClient.mockRestore();
  });

  it("passes custom fetch function", async () => {
    const customFetch = vi.fn();

    await getConfig({
      name: "feature",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      fetchFn: customFetch,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchFn: customFetch,
      })
    );
  });

  it("passes request timeout", async () => {
    await getConfig({
      name: "feature",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      requestTimeoutMs: 5000,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        requestTimeoutMs: 5000,
      })
    );
  });

  it("passes initialization timeout", async () => {
    await getConfig({
      name: "feature",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      initializationTimeoutMs: 10000,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        initializationTimeoutMs: 10000,
      })
    );
  });

  it("passes context for override evaluation to both client creation and get", async () => {
    const context = { userId: "123", plan: "premium" };

    await getConfig({
      name: "feature",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      context,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { userId: "123", plan: "premium" },
      })
    );

    expect(mockClient.get).toHaveBeenCalledWith("feature", {
      context: { userId: "123", plan: "premium" },
    });
  });
});

// ============================================================================
// getConfig - Return Values
// ============================================================================

describe("getConfig - Return Values", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    mockCreateClient?.mockRestore();
  });

  it("returns boolean value", async () => {
    const mockClient = createMockClient({ enabled: true });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const value = await getConfig<boolean>({
      name: "enabled",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toBe(true);
  });

  it("returns boolean false", async () => {
    const mockClient = createMockClient({ disabled: false });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const value = await getConfig<boolean>({
      name: "disabled",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toBe(false);
  });

  it("returns number value", async () => {
    const mockClient = createMockClient({ count: 42 });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const value = await getConfig<number>({
      name: "count",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toBe(42);
  });

  it("returns number zero", async () => {
    const mockClient = createMockClient({ zero: 0 });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const value = await getConfig<number>({
      name: "zero",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toBe(0);
  });

  it("returns string value", async () => {
    const mockClient = createMockClient({ message: "Hello World" });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const value = await getConfig<string>({
      name: "message",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toBe("Hello World");
  });

  it("returns empty string", async () => {
    const mockClient = createMockClient({ empty: "" });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const value = await getConfig<string>({
      name: "empty",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toBe("");
  });

  it("returns null value", async () => {
    const mockClient = createMockClient({ nullConfig: null });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const value = await getConfig<null>({
      name: "nullConfig",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toBe(null);
  });

  it("returns undefined for missing config", async () => {
    const mockClient = createMockClient({});
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const value = await getConfig<undefined>({
      name: "nonexistent",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toBe(undefined);
  });

  it("returns array value", async () => {
    const mockClient = createMockClient({ items: [1, 2, 3] });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const value = await getConfig<number[]>({
      name: "items",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toEqual([1, 2, 3]);
  });

  it("returns object value", async () => {
    const mockClient = createMockClient({
      config: { nested: { deep: "value" } },
    });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const value = await getConfig<{ nested: { deep: string } }>({
      name: "config",
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    });

    expect(value).toEqual({ nested: { deep: "value" } });
  });
});

// ============================================================================
// getConfig - Error Handling
// ============================================================================

describe("getConfig - Error Handling", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    mockCreateClient?.mockRestore();
  });

  it("propagates errors from createReplaneClient", async () => {
    const error = new Error("Network error");
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue(error);

    await expect(
      getConfig({
        name: "feature",
        baseUrl: "https://api.replane.dev",
        sdkKey: "rp_test_key",
      })
    ).rejects.toThrow("Network error");
  });

  it("propagates timeout errors", async () => {
    const error = new Error("Initialization timeout");
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue(error);

    await expect(
      getConfig({
        name: "feature",
        baseUrl: "https://api.replane.dev",
        sdkKey: "rp_test_key",
        initializationTimeoutMs: 1000,
      })
    ).rejects.toThrow("Initialization timeout");
  });

  it("handles authentication errors", async () => {
    const error = new Error("Invalid SDK key");
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue(error);

    await expect(
      getConfig({
        name: "feature",
        baseUrl: "https://api.replane.dev",
        sdkKey: "invalid_key",
      })
    ).rejects.toThrow("Invalid SDK key");
  });
});

// ============================================================================
// getConfig vs getReplaneSnapshot
// ============================================================================

describe("getConfig vs getReplaneSnapshot - Use Case Comparison", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({
      feature: true,
      count: 42,
      message: "Hello",
    });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);
  });

  afterEach(() => {
    mockCreateClient.mockRestore();
  });

  it("getConfig creates new client for each call", async () => {
    await getConfig({ name: "feature", baseUrl: "https://api.replane.dev", sdkKey: "rp_key" });
    await getConfig({ name: "count", baseUrl: "https://api.replane.dev", sdkKey: "rp_key" });
    await getConfig({ name: "message", baseUrl: "https://api.replane.dev", sdkKey: "rp_key" });

    expect(mockCreateClient).toHaveBeenCalledTimes(3);
    expect(mockClient.close).toHaveBeenCalledTimes(3);
  });

  it("getReplaneSnapshot creates single client for all configs", async () => {
    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_key",
    });

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockClient.close).toHaveBeenCalledTimes(1);
    // All configs are available in the snapshot
    expect(mockClient.getSnapshot).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Next.js Caching Integration (Conceptual Tests)
// ============================================================================

describe("Next.js Caching Integration", () => {
  let mockCreateClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);
  });

  afterEach(() => {
    mockCreateClient.mockRestore();
  });

  it("accepts custom fetch for Next.js caching", async () => {
    // Simulates Next.js fetch with caching options
    const nextFetch = vi.fn((url: string, init?: RequestInit) =>
      fetch(url, { ...init, cache: "force-cache" } as RequestInit)
    );

    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      fetchFn: nextFetch,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchFn: nextFetch,
      })
    );
  });

  it("accepts fetch with revalidation options", async () => {
    // Simulates Next.js fetch with ISR revalidation
    const isrFetch = vi.fn((url: string, init?: RequestInit) =>
      fetch(url, { ...init, next: { revalidate: 60 } } as RequestInit)
    );

    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      fetchFn: isrFetch,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchFn: isrFetch,
      })
    );
  });

  it("accepts fetch with tags for on-demand revalidation", async () => {
    // Simulates Next.js fetch with tags
    const taggedFetch = vi.fn((url: string, init?: RequestInit) =>
      fetch(url, { ...init, next: { tags: ["replane-config"] } } as RequestInit)
    );

    await getReplaneSnapshot({
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      fetchFn: taggedFetch,
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchFn: taggedFetch,
      })
    );
  });
});
