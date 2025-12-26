import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import type { Replane } from "@replanejs/sdk";
import type { ReplaneContextOptions } from "../src/types";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defaultTestOptions: ReplaneContextOptions<any> = {
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
        options: defaultTestOptions,
      },
    });

    // Provider should be in loading state
    expect(mockReplaneClass).toHaveBeenCalled();
    expect(screen.getByTestId("loader")).toBeInTheDocument();
  });

  it("transitions from loading to ready after initialization", async () => {
    render(TestProviderWithOptions, {
      props: {
        options: defaultTestOptions,
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
        options: defaultTestOptions,
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
        options: defaultTestOptions,
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
        options: defaultTestOptions,
      },
    });

    await waitFor(() => {
      expect(mockReplaneClass).toHaveBeenCalled();
      expect(mockClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: defaultTestOptions.baseUrl,
          sdkKey: defaultTestOptions.sdkKey,
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
        options: defaultTestOptions,
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
        options: defaultTestOptions,
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
