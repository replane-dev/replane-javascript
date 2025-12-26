import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import type { Replane, ConnectOptions } from "@replanejs/sdk";
import * as sdk from "@replanejs/sdk";

// Import test components and utilities
import ReplaneContext from "../src/ReplaneContext.svelte";
import TestUseReplane from "./components/TestUseReplane.svelte";
import TestUseConfig from "./components/TestUseConfig.svelte";
import TestMultipleConfigs from "./components/TestMultipleConfigs.svelte";
import TestConfigWithContext from "./components/TestConfigWithContext.svelte";
import TestNestedChildren from "./components/TestNestedChildren.svelte";
import TestUseReplaneOutsideProvider from "./components/TestUseReplaneOutsideProvider.svelte";
import TestCreateConfigStore from "./components/TestCreateConfigStore.svelte";
import TestProviderWithOptions from "./components/TestProviderWithOptions.svelte";

// ============================================================================
// Test Utilities
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockClient(configs: Record<string, unknown> = {}): Replane<any> & {
  _updateConfig: (name: string, value: unknown) => void;
  _triggerGlobalUpdate: () => void;
} {
  const subscribers = new Map<string, Set<() => void>>();
  const globalSubscribers = new Set<() => void>();
  const currentConfigs: Record<string, unknown> = { ...configs };

  return {
    get: vi.fn((name: string) => currentConfigs[name]),
    subscribe: vi.fn((nameOrCallback: string | (() => void), callback?: () => void) => {
      if (typeof nameOrCallback === "function") {
        // Global subscription
        globalSubscribers.add(nameOrCallback);
        return () => globalSubscribers.delete(nameOrCallback);
      }
      // Named subscription
      const name = nameOrCallback;
      if (!subscribers.has(name)) {
        subscribers.set(name, new Set());
      }
      subscribers.get(name)!.add(callback!);
      return () => {
        subscribers.get(name)?.delete(callback!);
      };
    }),
    disconnect: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    getSnapshot: vi.fn(() => ({
      configs: Object.entries(currentConfigs).map(([name, value]) => ({
        name,
        value,
        overrides: [],
      })),
    })),
    _updateConfig: (name: string, value: unknown) => {
      currentConfigs[name] = value;
      subscribers.get(name)?.forEach((cb) => cb());
      globalSubscribers.forEach((cb) => cb());
    },
    _triggerGlobalUpdate: () => {
      globalSubscribers.forEach((cb) => cb());
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as Replane<any> & {
    _updateConfig: (name: string, value: unknown) => void;
    _triggerGlobalUpdate: () => void;
  };
}

const defaultConnection: ConnectOptions = {
  baseUrl: "https://test.replane.dev",
  sdkKey: "rp_test_key",
};

// ============================================================================
// ReplaneContext with client prop
// ============================================================================

describe("ReplaneContext with client prop", () => {
  it("renders children immediately", () => {
    const client = createMockClient();

    render(ReplaneContext, {
      props: {
        client,
        children: vi.fn(),
      },
    });

    // Provider should render without issues
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("provides client to children via context", () => {
    const client = createMockClient({ testConfig: "testValue" });

    render(TestUseReplane, {
      props: { client },
    });

    expect(screen.getByTestId("has-client")).toHaveTextContent("true");
  });

  it("does not call client.disconnect on unmount when client is passed as prop", () => {
    const client = createMockClient();

    const { unmount } = render(TestUseReplane, {
      props: { client },
    });

    unmount();

    // Client should NOT be disconnected when passed as prop (user manages lifecycle)
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("works with deeply nested children", () => {
    const client = createMockClient({ nested: "value" });

    render(TestNestedChildren, {
      props: { client },
    });

    expect(screen.getByTestId("deep")).toHaveTextContent("value");
  });
});

// ============================================================================
// ReplaneContext with options prop - Loading States
// ============================================================================

describe("ReplaneContext with options prop - Loading States", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReplaneClass: any;
  let mockClient: ReturnType<typeof createMockClient>;
  let resolveConnect: () => void;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    const connectPromise = new Promise<void>((resolve) => {
      resolveConnect = resolve;
    });

    mockClient.connect = vi.fn().mockReturnValue(connectPromise);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);
  });

  afterEach(() => {
    mockReplaneClass.mockRestore();
  });

  it("shows loader while initializing", async () => {
    render(TestProviderWithOptions, {
      props: {
        connection: defaultConnection,
      },
    });

    // Provider should be in loading state
    expect(mockReplaneClass).toHaveBeenCalled();
    expect(screen.getByTestId("loader")).toBeInTheDocument();
  });

  it("transitions from loading to ready after initialization", async () => {
    render(TestProviderWithOptions, {
      props: {
        connection: defaultConnection,
      },
    });

    expect(screen.getByTestId("loader")).toBeInTheDocument();

    resolveConnect();
    await tick();

    await waitFor(() => {
      expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });

  it("throws error when initialization fails (for error boundary)", async () => {
    const error = new Error("Connection failed");
    mockClient.connect = vi.fn().mockRejectedValue(error);

    render(TestProviderWithOptions, {
      props: {
        connection: defaultConnection,
      },
    });

    await waitFor(() => {
      // The error should be caught by the boundary in the test component
      expect(screen.getByTestId("error")).toHaveTextContent("Connection failed");
    });
  });

  it("wraps non-Error rejections in Error", async () => {
    mockClient.connect = vi.fn().mockRejectedValue("string error");

    render(TestProviderWithOptions, {
      props: {
        connection: defaultConnection,
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("string error");
    });
  });
});

// ============================================================================
// ReplaneContext with options prop - Client Lifecycle
// ============================================================================

describe("ReplaneContext with options prop - Client Lifecycle", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReplaneClass: any;

  afterEach(() => {
    mockReplaneClass?.mockRestore();
  });

  it("creates Replane instance with correct options and calls connect", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    render(TestProviderWithOptions, {
      props: {
        connection: defaultConnection,
      },
    });

    await waitFor(() => {
      expect(mockReplaneClass).toHaveBeenCalled();
      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: defaultConnection.baseUrl,
          sdkKey: defaultConnection.sdkKey,
        })
      );
    });
  });

  it("disconnects client on unmount after successful initialization", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const { unmount } = render(TestProviderWithOptions, {
      props: {
        connection: defaultConnection,
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });

    unmount();

    await waitFor(() => {
      expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  it("handles unmount during initialization gracefully", async () => {
    const mockClient = createMockClient();
    let resolveConnect: () => void;
    const connectPromise = new Promise<void>((resolve) => {
      resolveConnect = resolve;
    });

    mockClient.connect = vi.fn().mockReturnValue(connectPromise);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const { unmount } = render(TestProviderWithOptions, {
      props: {
        connection: defaultConnection,
      },
    });

    // Unmount while still loading
    unmount();

    // Resolve after unmount - should disconnect the client
    resolveConnect!();
    await tick();

    await waitFor(() => {
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// getReplane
// ============================================================================

describe("getReplane", () => {
  it("throws descriptive error when used outside ReplaneProvider", () => {
    expect(() => render(TestUseReplaneOutsideProvider)).toThrow(
      "getReplane() must be used within a ReplaneContext"
    );
  });

  it("returns the Replane client directly", () => {
    const client = createMockClient();

    render(TestUseReplane, {
      props: { client },
    });

    expect(screen.getByTestId("has-client")).toHaveTextContent("true");
  });
});

// ============================================================================
// config - Basic Functionality
// ============================================================================

describe("config - Basic Functionality", () => {
  it("returns config value for existing config", () => {
    const client = createMockClient({ myConfig: "myValue" });

    render(TestUseConfig, {
      props: { client, configName: "myConfig" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("myValue");
    expect(client.get).toHaveBeenCalledWith("myConfig", undefined);
  });

  it("passes context options to client.get", () => {
    const client = createMockClient({ greeting: "Hello" });

    render(TestConfigWithContext, {
      props: {
        client,
        configName: "greeting",
        context: { userId: "123", plan: "premium" },
      },
    });

    expect(client.get).toHaveBeenCalledWith("greeting", {
      context: { userId: "123", plan: "premium" },
    });
  });

  it("handles undefined config value", () => {
    const client = createMockClient({});

    render(TestUseConfig, {
      props: { client, configName: "nonexistent" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("UNDEFINED");
  });

  it("handles null config value", () => {
    const client = createMockClient({ nullConfig: null });

    render(TestUseConfig, {
      props: { client, configName: "nullConfig" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("NULL");
  });

  it("handles boolean config values", () => {
    const client = createMockClient({ enabled: true, disabled: false });

    render(TestMultipleConfigs, {
      props: { client, configNames: ["enabled", "disabled"] },
    });

    expect(screen.getByTestId("value-enabled")).toHaveTextContent("true");
    expect(screen.getByTestId("value-disabled")).toHaveTextContent("false");
  });

  it("handles number config values including zero", () => {
    const client = createMockClient({
      positive: 42,
      negative: -10,
      zero: 0,
      float: 3.14,
    });

    render(TestMultipleConfigs, {
      props: { client, configNames: ["positive", "negative", "zero", "float"] },
    });

    expect(screen.getByTestId("value-positive")).toHaveTextContent("42");
    expect(screen.getByTestId("value-negative")).toHaveTextContent("-10");
    expect(screen.getByTestId("value-zero")).toHaveTextContent("0");
    expect(screen.getByTestId("value-float")).toHaveTextContent("3.14");
  });

  it("handles array config values", () => {
    const client = createMockClient({ items: [1, 2, 3] });

    render(TestUseConfig, {
      props: { client, configName: "items", isArray: true },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("1,2,3");
  });

  it("handles object config values", () => {
    const config = { nested: { deep: { value: "found" } }, array: [1, 2] };
    const client = createMockClient({ complex: config });

    render(TestUseConfig, {
      props: { client, configName: "complex", isObject: true },
    });

    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(config));
  });
});

// ============================================================================
// config - Subscriptions
// ============================================================================

describe("config - Subscriptions", () => {
  it("subscribes to config on mount", () => {
    const client = createMockClient({ counter: 0 });

    render(TestUseConfig, {
      props: { client, configName: "counter" },
    });

    expect(client.subscribe).toHaveBeenCalledWith("counter", expect.any(Function));
  });

  it("unsubscribes from config on unmount", () => {
    const client = createMockClient({ value: "test" });
    const unsubscribe = vi.fn();
    vi.mocked(client.subscribe).mockReturnValue(unsubscribe);

    const { unmount } = render(TestUseConfig, {
      props: { client, configName: "value" },
    });

    expect(unsubscribe).not.toHaveBeenCalled();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("updates component when config value changes", async () => {
    const client = createMockClient({ counter: 0 });

    render(TestUseConfig, {
      props: { client, configName: "counter" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("0");

    client._updateConfig("counter", 42);
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("42");
    });
  });

  it("handles multiple rapid updates correctly", async () => {
    const client = createMockClient({ value: 0 });

    render(TestUseConfig, {
      props: { client, configName: "value" },
    });

    client._updateConfig("value", 1);
    client._updateConfig("value", 2);
    client._updateConfig("value", 3);
    client._updateConfig("value", 4);
    client._updateConfig("value", 5);
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("5");
    });
  });
});

// ============================================================================
// Multiple configs
// ============================================================================

describe("Multiple configs", () => {
  it("allows reading multiple configs in one component", () => {
    const client = createMockClient({
      config1: "value1",
      config2: "value2",
      config3: "value3",
    });

    render(TestMultipleConfigs, {
      props: { client, configNames: ["config1", "config2", "config3"] },
    });

    expect(screen.getByTestId("value-config1")).toHaveTextContent("value1");
    expect(screen.getByTestId("value-config2")).toHaveTextContent("value2");
    expect(screen.getByTestId("value-config3")).toHaveTextContent("value3");
  });

  it("updates correct component when one config changes", async () => {
    const client = createMockClient({ configA: "A", configB: "B" });

    render(TestMultipleConfigs, {
      props: { client, configNames: ["configA", "configB"] },
    });

    expect(screen.getByTestId("value-configA")).toHaveTextContent("A");
    expect(screen.getByTestId("value-configB")).toHaveTextContent("B");

    client._updateConfig("configA", "A-updated");
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("value-configA")).toHaveTextContent("A-updated");
      expect(screen.getByTestId("value-configB")).toHaveTextContent("B");
    });
  });

  it("handles same config subscribed by multiple components", async () => {
    const client = createMockClient({ shared: 0 });

    render(TestMultipleConfigs, {
      props: { client, configNames: ["shared", "shared"], testId: ["sharedA", "sharedB"] },
    });

    expect(screen.getByTestId("value-sharedA")).toHaveTextContent("0");
    expect(screen.getByTestId("value-sharedB")).toHaveTextContent("0");

    client._updateConfig("shared", 100);
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("value-sharedA")).toHaveTextContent("100");
      expect(screen.getByTestId("value-sharedB")).toHaveTextContent("100");
    });
  });
});

// ============================================================================
// configFrom
// ============================================================================

describe("configFrom", () => {
  it("creates a reactive store from client", () => {
    const client = createMockClient({ directStore: "storeValue" });

    render(TestCreateConfigStore, {
      props: { client, configName: "directStore" },
    });

    expect(screen.getByTestId("store-value")).toHaveTextContent("storeValue");
  });

  it("updates when config changes", async () => {
    const client = createMockClient({ counter: 0 });

    render(TestCreateConfigStore, {
      props: { client, configName: "counter" },
    });

    expect(screen.getByTestId("store-value")).toHaveTextContent("0");

    client._updateConfig("counter", 99);
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("store-value")).toHaveTextContent("99");
    });
  });

  it("unsubscribes on cleanup", () => {
    const client = createMockClient({ value: "test" });
    const unsubscribe = vi.fn();
    vi.mocked(client.subscribe).mockReturnValue(unsubscribe);

    const { unmount } = render(TestCreateConfigStore, {
      props: { client, configName: "value" },
    });

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  it("handles empty string config value", () => {
    const client = createMockClient({ empty: "" });

    render(TestUseConfig, {
      props: { client, configName: "empty" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("EMPTY_STRING");
  });

  it("handles config name with special characters", () => {
    const client = createMockClient({
      "feature.flag.enabled": true,
      "config-with-dashes": "works",
      config_with_underscores: "also_works",
    });

    render(TestMultipleConfigs, {
      props: {
        client,
        configNames: ["feature.flag.enabled", "config-with-dashes", "config_with_underscores"],
        testId: ["dots", "dashes", "underscores"],
      },
    });

    expect(screen.getByTestId("value-dots")).toHaveTextContent("true");
    expect(screen.getByTestId("value-dashes")).toHaveTextContent("works");
    expect(screen.getByTestId("value-underscores")).toHaveTextContent("also_works");
  });

  it("handles very large config values", () => {
    const largeArray = Array.from({ length: 1000 }, (_, i) => i);
    const client = createMockClient({ largeArray });

    render(TestUseConfig, {
      props: { client, configName: "largeArray", isArray: true, showLength: true },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("1000");
  });

  it("handles unicode config values", () => {
    const client = createMockClient({
      unicode: "Hello 世界 مرحبا",
    });

    render(TestUseConfig, {
      props: { client, configName: "unicode" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("Hello 世界 مرحبا");
  });

  it("handles Date object config values", () => {
    const date = new Date("2024-01-15T12:00:00Z");
    const client = createMockClient({ date });

    render(TestUseConfig, {
      props: { client, configName: "date", isDate: true },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("2024-01-15T12:00:00.000Z");
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe("Integration Scenarios", () => {
  it("properly cleans up all subscriptions on unmount", () => {
    const client = createMockClient({
      config1: "1",
      config2: "2",
      config3: "3",
    });

    const unsubscribes = [vi.fn(), vi.fn(), vi.fn()];
    let callIndex = 0;

    vi.mocked(client.subscribe).mockImplementation(() => {
      return unsubscribes[callIndex++];
    });

    const { unmount } = render(TestMultipleConfigs, {
      props: { client, configNames: ["config1", "config2", "config3"] },
    });

    unmount();

    unsubscribes.forEach((unsub) => {
      expect(unsub).toHaveBeenCalledTimes(1);
    });
  });

  it("handles conditional rendering of config consumers", async () => {
    const client = createMockClient({ conditionalConfig: "visible" });

    const { rerender } = render(TestUseConfig, {
      props: { client, configName: "conditionalConfig", showConditional: false },
    });

    expect(screen.queryByTestId("conditional")).not.toBeInTheDocument();

    // Use rerender to update props in Svelte 5
    await rerender({ client, configName: "conditionalConfig", showConditional: true });
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("conditional")).toHaveTextContent("visible");
    });
  });
});

// ============================================================================
// ReplaneContext with async prop
// ============================================================================

describe("ReplaneContext with async prop", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReplaneClass: any;
  let mockClient: ReturnType<typeof createMockClient>;
  let resolveConnect: () => void;
  let rejectConnect: (error: Error) => void;

  beforeEach(async () => {
    // Dynamically import the test components
    const TestAsyncProvider = (await import("./components/TestAsyncProvider.svelte")).default;
    const TestAsyncProviderWithConfig = (
      await import("./components/TestAsyncProviderWithConfig.svelte")
    ).default;

    // Store for use in tests
    (globalThis as Record<string, unknown>).__TestAsyncProvider = TestAsyncProvider;
    (globalThis as Record<string, unknown>).__TestAsyncProviderWithConfig = TestAsyncProviderWithConfig;

    mockClient = createMockClient({ feature: "default-value" });
    const connectPromise = new Promise<void>((resolve, reject) => {
      resolveConnect = resolve;
      rejectConnect = reject;
    });

    mockClient.connect = vi.fn().mockReturnValue(connectPromise);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);
  });

  afterEach(() => {
    mockReplaneClass.mockRestore();
  });

  it("renders children immediately without waiting for connection", async () => {
    const TestAsyncProvider = (globalThis as Record<string, unknown>).__TestAsyncProvider as typeof import("./components/TestAsyncProvider.svelte").default;

    render(TestAsyncProvider, {
      props: {
        connection: defaultConnection,
        defaults: { feature: "default-value" },
      },
    });

    // Content should be visible immediately
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("creates client with defaults", async () => {
    const TestAsyncProvider = (globalThis as Record<string, unknown>).__TestAsyncProvider as typeof import("./components/TestAsyncProvider.svelte").default;

    const defaults = { feature: "my-default" };

    render(TestAsyncProvider, {
      props: {
        connection: defaultConnection,
        defaults,
      },
    });

    expect(mockReplaneClass).toHaveBeenCalledWith(
      expect.objectContaining({
        defaults,
      })
    );
  });

  it("connects in the background after render", async () => {
    const TestAsyncProvider = (globalThis as Record<string, unknown>).__TestAsyncProvider as typeof import("./components/TestAsyncProvider.svelte").default;

    render(TestAsyncProvider, {
      props: {
        connection: defaultConnection,
        defaults: { feature: "default-value" },
      },
    });

    // Content is rendered immediately
    expect(screen.getByTestId("content")).toBeInTheDocument();

    await tick();

    // Connection should be initiated
    await waitFor(() => {
      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: defaultConnection.baseUrl,
          sdkKey: defaultConnection.sdkKey,
        })
      );
    });
  });

  it("allows config to retrieve default values immediately", async () => {
    const TestAsyncProviderWithConfig = (globalThis as Record<string, unknown>).__TestAsyncProviderWithConfig as typeof import("./components/TestAsyncProviderWithConfig.svelte").default;

    render(TestAsyncProviderWithConfig, {
      props: {
        connection: defaultConnection,
        defaults: { feature: "default-value" },
        configName: "feature",
      },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("default-value");
  });

  it("updates values when connection succeeds and server sends new values", async () => {
    const TestAsyncProviderWithConfig = (globalThis as Record<string, unknown>).__TestAsyncProviderWithConfig as typeof import("./components/TestAsyncProviderWithConfig.svelte").default;

    render(TestAsyncProviderWithConfig, {
      props: {
        connection: defaultConnection,
        defaults: { feature: "default-value" },
        configName: "feature",
      },
    });

    // Initially shows default
    expect(screen.getByTestId("value")).toHaveTextContent("default-value");

    // Simulate successful connection
    resolveConnect();
    await tick();

    // Simulate server sending new value
    mockClient._updateConfig("feature", "server-value");
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("server-value");
    });
  });

  it("logs error when connection fails but does not throw", async () => {
    const TestAsyncProvider = (globalThis as Record<string, unknown>).__TestAsyncProvider as typeof import("./components/TestAsyncProvider.svelte").default;

    const mockLogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    };

    render(TestAsyncProvider, {
      props: {
        connection: defaultConnection,
        defaults: { feature: "default-value" },
        logger: mockLogger,
      },
    });

    // Content should be visible
    expect(screen.getByTestId("content")).toBeInTheDocument();

    // Simulate connection failure
    rejectConnect(new Error("Connection failed"));
    await tick();

    // Error should be logged, not thrown
    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to connect Replane client",
        expect.any(Error)
      );
    });

    // Content should still be visible (no error boundary triggered)
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.queryByTestId("error")).not.toBeInTheDocument();
  });

  it("uses console.error when no logger provided and connection fails", async () => {
    const TestAsyncProvider = (globalThis as Record<string, unknown>).__TestAsyncProvider as typeof import("./components/TestAsyncProvider.svelte").default;

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(TestAsyncProvider, {
      props: {
        connection: defaultConnection,
        defaults: { feature: "default-value" },
      },
    });

    rejectConnect(new Error("Connection failed"));
    await tick();

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to connect Replane client",
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it("does not connect when connection is null", async () => {
    const TestAsyncProvider = (globalThis as Record<string, unknown>).__TestAsyncProvider as typeof import("./components/TestAsyncProvider.svelte").default;

    render(TestAsyncProvider, {
      props: {
        connection: null,
        defaults: { feature: "default-value" },
      },
    });

    expect(screen.getByTestId("content")).toBeInTheDocument();

    // Wait a bit and verify connect was never called
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockClient.connect).not.toHaveBeenCalled();
  });

  it("works with context prop for override evaluations", async () => {
    const TestAsyncProvider = (globalThis as Record<string, unknown>).__TestAsyncProvider as typeof import("./components/TestAsyncProvider.svelte").default;

    const context = { userId: "user-123", plan: "premium" };

    render(TestAsyncProvider, {
      props: {
        connection: defaultConnection,
        defaults: { feature: "default-value" },
        context,
      },
    });

    expect(mockReplaneClass).toHaveBeenCalledWith(
      expect.objectContaining({
        context,
      })
    );
  });
});

// ============================================================================
// Additional Edge Cases
// ============================================================================

describe("Additional Edge Cases", () => {
  it("handles empty array config value", () => {
    const client = createMockClient({ emptyArray: [] });

    render(TestUseConfig, {
      props: { client, configName: "emptyArray", isArray: true, showLength: true },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("0");
  });

  it("handles empty object config value", () => {
    const client = createMockClient({ emptyObject: {} });

    render(TestUseConfig, {
      props: { client, configName: "emptyObject", isObject: true },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("{}");
  });

  it("handles deeply nested objects in config", () => {
    const deepConfig = {
      level1: {
        level2: {
          level3: {
            value: "deep-value",
          },
        },
      },
    };

    const client = createMockClient({ deep: deepConfig });

    render(TestUseConfig, {
      props: { client, configName: "deep", isObject: true },
    });

    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(deepConfig));
  });

  it("handles config value changing from null to non-null", async () => {
    const client = createMockClient({ nullable: null });

    render(TestUseConfig, {
      props: { client, configName: "nullable" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("NULL");

    client._updateConfig("nullable", "now-has-value");
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("now-has-value");
    });
  });

  it("handles config value changing from non-null to null", async () => {
    const client = createMockClient({ nullable: "has-value" });

    render(TestUseConfig, {
      props: { client, configName: "nullable" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("has-value");

    client._updateConfig("nullable", null);
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("NULL");
    });
  });

  it("handles config value type change (string to number)", async () => {
    const client = createMockClient({ value: "string-value" });

    render(TestUseConfig, {
      props: { client, configName: "value" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("string-value");

    client._updateConfig("value", 42);
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("42");
    });
  });

  it("handles config value type change (primitive to object)", async () => {
    const client = createMockClient({ value: "string" });

    render(TestUseConfig, {
      props: { client, configName: "value", isObject: true },
    });

    expect(screen.getByTestId("value")).toHaveTextContent('"string"');

    const newValue = { nested: { key: "value" } };
    client._updateConfig("value", newValue);
    await tick();

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(newValue));
    });
  });

  it("handles config with connection: null", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockReplaneClass: any;
    const mockClient = createMockClient({ feature: "default-value" });
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const TestAsyncProvider = (await import("./components/TestAsyncProvider.svelte")).default;

    render(TestAsyncProvider, {
      props: {
        connection: null,
        defaults: { feature: "default-value" },
      },
    });

    expect(screen.getByTestId("content")).toBeInTheDocument();

    // Should not call connect when connection is null
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockClient.connect).not.toHaveBeenCalled();

    mockReplaneClass.mockRestore();
  });

  it("handles provider with isolated client state", () => {
    const client = createMockClient({ feature: "client-value" });

    render(TestUseConfig, {
      props: { client, configName: "feature" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent("client-value");
  });

  it("handles config with very long string value", () => {
    const longString = "a".repeat(10000);
    const client = createMockClient({ longValue: longString });

    render(TestUseConfig, {
      props: { client, configName: "longValue" },
    });

    expect(screen.getByTestId("value")).toHaveTextContent(longString);
  });

  it("handles config with special JSON characters", () => {
    const specialValue = {
      quote: '"quoted"',
      backslash: "\\path\\to\\file",
      newline: "line1\nline2",
      tab: "col1\tcol2",
    };
    const client = createMockClient({ special: specialValue });

    render(TestUseConfig, {
      props: { client, configName: "special", isObject: true },
    });

    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(specialValue));
  });
});
