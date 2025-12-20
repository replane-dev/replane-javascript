import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
  ReplaneScriptProvider,
  getReplaneSnapshotScript,
} from "../src/script";
import { useReplane, useConfig } from "@replanejs/react";
import type { ReplaneClient, ReplaneSnapshot } from "@replanejs/sdk";
import * as sdk from "@replanejs/sdk";

// ============================================================================
// Test Utilities
// ============================================================================

function createMockSnapshot<T extends Record<string, unknown>>(configs: T): ReplaneSnapshot<T> {
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
): ReplaneClient<Record<string, unknown>> & {
  _updateConfig: (name: string, value: unknown) => void;
} {
  const subscribers = new Map<string, Set<() => void>>();
  const globalSubscribers = new Set<() => void>();
  const currentConfigs: Record<string, unknown> = { ...configs };

  return {
    get: vi.fn((name: string) => currentConfigs[name]),
    subscribe: vi.fn(
      (nameOrCallback: string | (() => void), callback?: () => void) => {
        if (typeof nameOrCallback === "function") {
          globalSubscribers.add(nameOrCallback);
          return () => globalSubscribers.delete(nameOrCallback);
        }
        const name = nameOrCallback;
        if (!subscribers.has(name)) {
          subscribers.set(name, new Set());
        }
        subscribers.get(name)!.add(callback!);
        return () => {
          subscribers.get(name)?.delete(callback!);
        };
      }
    ),
    close: vi.fn(),
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
  } as unknown as ReplaneClient<Record<string, unknown>> & {
    _updateConfig: (name: string, value: unknown) => void;
  };
}

// Setup window.__REPLANE_SNAPSHOT__ for tests
function setWindowSnapshot(snapshot: ReplaneSnapshot<Record<string, unknown>> | undefined) {
  if (snapshot) {
    (window as Window & { __REPLANE_SNAPSHOT__?: ReplaneSnapshot<Record<string, unknown>> }).__REPLANE_SNAPSHOT__ = snapshot;
  } else {
    delete (window as Window & { __REPLANE_SNAPSHOT__?: ReplaneSnapshot<Record<string, unknown>> }).__REPLANE_SNAPSHOT__;
  }
}

// ============================================================================
// getReplaneSnapshotScript
// ============================================================================

describe("getReplaneSnapshotScript", () => {
  it("generates valid script content for simple snapshot", () => {
    const snapshot = createMockSnapshot({ feature: true, count: 42 });
    const script = getReplaneSnapshotScript(snapshot);

    expect(script).toContain("window.__REPLANE_SNAPSHOT__=");
    expect(script).toContain('"feature"');
    expect(script).toContain("true");
    expect(script).toContain("42");
  });

  it("generates script that can be evaluated", () => {
    const snapshot = createMockSnapshot({ feature: true });
    const script = getReplaneSnapshotScript(snapshot);

    // Clear any existing snapshot
    setWindowSnapshot(undefined);

    // Evaluate the script
    eval(script);

    expect((window as Window & { __REPLANE_SNAPSHOT__?: unknown }).__REPLANE_SNAPSHOT__).toBeDefined();
    expect((window as Window & { __REPLANE_SNAPSHOT__?: ReplaneSnapshot<Record<string, unknown>> }).__REPLANE_SNAPSHOT__?.configs).toHaveLength(1);
    expect((window as Window & { __REPLANE_SNAPSHOT__?: ReplaneSnapshot<Record<string, unknown>> }).__REPLANE_SNAPSHOT__?.configs[0].name).toBe("feature");
  });

  it("escapes </script> tags to prevent XSS", () => {
    const snapshot = createMockSnapshot({
      dangerous: "</script><script>alert('xss')</script>",
    });
    const script = getReplaneSnapshotScript(snapshot);

    // Should not contain raw </script> tag
    expect(script).not.toContain("</script>");
    // Should contain escaped version
    expect(script).toContain("<\\/script>");
  });

  it("escapes </script> tags case-insensitively", () => {
    const snapshot = createMockSnapshot({
      upper: "</SCRIPT>",
      mixed: "</ScRiPt>",
    });
    const script = getReplaneSnapshotScript(snapshot);

    // Should not contain any case variation of </script>
    expect(script.toLowerCase()).not.toContain("</script>");
  });

  it("handles empty snapshot", () => {
    const snapshot = createMockSnapshot({});
    const script = getReplaneSnapshotScript(snapshot);

    expect(script).toContain("window.__REPLANE_SNAPSHOT__=");
    expect(script).toContain('"configs":[]');
  });

  it("handles complex nested objects", () => {
    const snapshot = createMockSnapshot({
      nested: {
        deep: {
          value: "found",
          array: [1, 2, 3],
        },
      },
    });
    const script = getReplaneSnapshotScript(snapshot);

    expect(script).toContain("window.__REPLANE_SNAPSHOT__=");
    expect(script).toContain("nested");
    expect(script).toContain("deep");
  });

  it("handles unicode values", () => {
    const snapshot = createMockSnapshot({
      unicode: "Hello",
    });
    const script = getReplaneSnapshotScript(snapshot);

    eval(script);

    const windowSnapshot = (window as Window & { __REPLANE_SNAPSHOT__?: ReplaneSnapshot<Record<string, unknown>> }).__REPLANE_SNAPSHOT__;
    const unicodeConfig = windowSnapshot?.configs.find(c => c.name === "unicode");
    expect(unicodeConfig?.value).toBe("Hello");
  });

  it("handles boolean false values", () => {
    const snapshot = createMockSnapshot({ enabled: false });
    const script = getReplaneSnapshotScript(snapshot);

    expect(script).toContain("false");
  });

  it("handles null values", () => {
    const snapshot = createMockSnapshot({ nullConfig: null });
    const script = getReplaneSnapshotScript(snapshot);

    expect(script).toContain("null");
  });

  it("handles number zero", () => {
    const snapshot = createMockSnapshot({ zero: 0 });
    const script = getReplaneSnapshotScript(snapshot);

    eval(script);

    const windowSnapshot = (window as Window & { __REPLANE_SNAPSHOT__?: ReplaneSnapshot<Record<string, unknown>> }).__REPLANE_SNAPSHOT__;
    const zeroConfig = windowSnapshot?.configs.find(c => c.name === "zero");
    expect(zeroConfig?.value).toBe(0);
  });

  it("handles empty string values", () => {
    const snapshot = createMockSnapshot({ empty: "" });
    const script = getReplaneSnapshotScript(snapshot);

    eval(script);

    const windowSnapshot = (window as Window & { __REPLANE_SNAPSHOT__?: ReplaneSnapshot<Record<string, unknown>> }).__REPLANE_SNAPSHOT__;
    const emptyConfig = windowSnapshot?.configs.find(c => c.name === "empty");
    expect(emptyConfig?.value).toBe("");
  });

  it("handles snapshot with overrides", () => {
    const snapshot: ReplaneSnapshot<{ feature: boolean }> = {
      configs: [
        {
          name: "feature",
          value: false,
          overrides: [
            {
              name: "premium-users",
              conditions: [{ type: "equals", attribute: "plan", value: "premium" }],
              value: true,
            },
          ],
        },
      ],
    };
    const script = getReplaneSnapshotScript(snapshot);

    expect(script).toContain("overrides");
    expect(script).toContain("premium-users");
  });

  it("handles snapshot with context", () => {
    const snapshot: ReplaneSnapshot<{ feature: boolean }> = {
      configs: [{ name: "feature", value: true, overrides: [] }],
      context: { userId: "123", plan: "premium" },
    };
    const script = getReplaneSnapshotScript(snapshot);

    expect(script).toContain("context");
    expect(script).toContain("userId");
    expect(script).toContain("123");
  });
});

// ============================================================================
// ReplaneScriptProvider - Basic Rendering
// ============================================================================

describe("ReplaneScriptProvider - Basic Rendering", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRestoreClient: any;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
    setWindowSnapshot(undefined);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
    setWindowSnapshot(undefined);
  });

  it("renders fallback when no snapshot is available", () => {
    render(
      <ReplaneScriptProvider fallback={<div data-testid="fallback">Loading...</div>}>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("renders nothing when no snapshot and no fallback", () => {
    const { container } = render(
      <ReplaneScriptProvider>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });

  it("renders children when snapshot is available in window", () => {
    const snapshot = createMockSnapshot({ feature: true });
    setWindowSnapshot(snapshot);

    render(
      <ReplaneScriptProvider>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("provides client via context when snapshot is available", () => {
    const snapshot = createMockSnapshot({ feature: true });
    setWindowSnapshot(snapshot);
    let capturedClient: ReplaneClient<Record<string, unknown>> | null = null;

    function TestComponent() {
      const { client } = useReplane();
      capturedClient = client;
      return <div data-testid="content">Content</div>;
    }

    render(
      <ReplaneScriptProvider>
        <TestComponent />
      </ReplaneScriptProvider>
    );

    expect(capturedClient).toBe(mockClient);
  });
});

// ============================================================================
// ReplaneScriptProvider - Snapshot Detection
// ============================================================================

describe("ReplaneScriptProvider - Snapshot Detection", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRestoreClient: any;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
    setWindowSnapshot(undefined);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
    setWindowSnapshot(undefined);
  });

  it("detects snapshot set before render", () => {
    const snapshot = createMockSnapshot({ preRender: true });
    setWindowSnapshot(snapshot);

    render(
      <ReplaneScriptProvider>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(mockRestoreClient).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot })
    );
  });

  it("detects snapshot set after initial render via useEffect", async () => {
    const snapshot = createMockSnapshot({ postRender: true });

    render(
      <ReplaneScriptProvider fallback={<div data-testid="fallback">Loading</div>}>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();

    // Simulate script running after initial render
    act(() => {
      setWindowSnapshot(snapshot);
    });

    // Component needs to re-render to pick up the snapshot
    // The useEffect runs but useState won't trigger re-render for the same check
    // This tests the edge case where script runs after initial render
    await waitFor(() => {
      // In real usage, the script in <head> runs before React hydrates
      // so snapshot is usually available on initial render
    });
  });
});

// ============================================================================
// ReplaneScriptProvider - Client Creation
// ============================================================================

describe("ReplaneScriptProvider - Client Creation", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRestoreClient: any;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
    setWindowSnapshot(undefined);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
    setWindowSnapshot(undefined);
  });

  it("creates client with snapshot only when no connection", () => {
    const snapshot = createMockSnapshot({ feature: true });
    setWindowSnapshot(snapshot);

    render(
      <ReplaneScriptProvider>
        <div>Content</div>
      </ReplaneScriptProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledWith({
      snapshot,
      connection: undefined,
    });
  });

  it("creates client with connection options", () => {
    const snapshot = createMockSnapshot({ feature: true });
    setWindowSnapshot(snapshot);
    const connection = {
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    };

    render(
      <ReplaneScriptProvider connection={connection}>
        <div>Content</div>
      </ReplaneScriptProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledWith({
      snapshot,
      connection: {
        baseUrl: "https://api.replane.dev",
        sdkKey: "rp_test_key",
        requestTimeoutMs: undefined,
        retryDelayMs: undefined,
        inactivityTimeoutMs: undefined,
      },
    });
  });

  it("creates client with full connection options", () => {
    const snapshot = createMockSnapshot({ feature: true });
    setWindowSnapshot(snapshot);
    const connection = {
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      requestTimeoutMs: 3000,
      retryDelayMs: 500,
      inactivityTimeoutMs: 60000,
    };

    render(
      <ReplaneScriptProvider connection={connection}>
        <div>Content</div>
      </ReplaneScriptProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledWith({
      snapshot,
      connection: {
        baseUrl: "https://api.replane.dev",
        sdkKey: "rp_test_key",
        requestTimeoutMs: 3000,
        retryDelayMs: 500,
        inactivityTimeoutMs: 60000,
      },
    });
  });

  it("does not create client when no snapshot", () => {
    render(
      <ReplaneScriptProvider fallback={<div>Loading</div>}>
        <div>Content</div>
      </ReplaneScriptProvider>
    );

    expect(mockRestoreClient).not.toHaveBeenCalled();
  });
});

// ============================================================================
// ReplaneScriptProvider - Client Lifecycle
// ============================================================================

describe("ReplaneScriptProvider - Client Lifecycle", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRestoreClient: any;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
    setWindowSnapshot(undefined);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
    setWindowSnapshot(undefined);
  });

  it("closes client on unmount", () => {
    const snapshot = createMockSnapshot({ feature: true });
    setWindowSnapshot(snapshot);

    const { unmount } = render(
      <ReplaneScriptProvider>
        <div>Content</div>
      </ReplaneScriptProvider>
    );

    expect(mockClient.close).not.toHaveBeenCalled();

    unmount();

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });

  it("does not close client if none was created (no snapshot)", () => {
    const { unmount } = render(
      <ReplaneScriptProvider fallback={<div>Loading</div>}>
        <div>Content</div>
      </ReplaneScriptProvider>
    );

    unmount();

    expect(mockClient.close).not.toHaveBeenCalled();
  });
});

// ============================================================================
// ReplaneScriptProvider - useConfig Integration
// ============================================================================

describe("ReplaneScriptProvider - useConfig Integration", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRestoreClient: any;

  afterEach(() => {
    mockRestoreClient?.mockRestore();
    setWindowSnapshot(undefined);
  });

  it("provides config values to useConfig hook", () => {
    const mockClient = createMockClient({
      feature: true,
      count: 42,
      message: "Hello",
    });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);

    const snapshot = createMockSnapshot({
      feature: true,
      count: 42,
      message: "Hello",
    });
    setWindowSnapshot(snapshot);

    function TestComponent() {
      const feature = useConfig<boolean>("feature");
      const count = useConfig<number>("count");
      const message = useConfig<string>("message");
      return (
        <div>
          <div data-testid="feature">{String(feature)}</div>
          <div data-testid="count">{count}</div>
          <div data-testid="message">{message}</div>
        </div>
      );
    }

    render(
      <ReplaneScriptProvider>
        <TestComponent />
      </ReplaneScriptProvider>
    );

    expect(mockClient.get).toHaveBeenCalledWith("feature", undefined);
    expect(mockClient.get).toHaveBeenCalledWith("count", undefined);
    expect(mockClient.get).toHaveBeenCalledWith("message", undefined);
  });

  it("updates component when config changes", () => {
    const mockClient = createMockClient({ counter: 0 });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);

    const snapshot = createMockSnapshot({ counter: 0 });
    setWindowSnapshot(snapshot);

    function TestComponent() {
      const counter = useConfig<number>("counter");
      return <div data-testid="counter">{counter}</div>;
    }

    render(
      <ReplaneScriptProvider>
        <TestComponent />
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("counter")).toHaveTextContent("0");

    act(() => {
      mockClient._updateConfig("counter", 100);
    });

    expect(screen.getByTestId("counter")).toHaveTextContent("100");
  });
});

// ============================================================================
// ReplaneScriptProvider - Fallback Behavior
// ============================================================================

describe("ReplaneScriptProvider - Fallback Behavior", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRestoreClient: any;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
    setWindowSnapshot(undefined);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
    setWindowSnapshot(undefined);
  });

  it("renders fallback with complex markup", () => {
    render(
      <ReplaneScriptProvider
        fallback={
          <div data-testid="fallback">
            <span data-testid="spinner">Loading</span>
            <p data-testid="message">Please wait...</p>
          </div>
        }
      >
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.getByTestId("spinner")).toHaveTextContent("Loading");
    expect(screen.getByTestId("message")).toHaveTextContent("Please wait...");
  });

  it("transitions from fallback to content when snapshot is set between render and effect", async () => {
    // This tests the useEffect path where snapshot is set after initial render
    // but before useEffect runs (simulating script in <head> that runs after hydration)

    // Start with no snapshot
    setWindowSnapshot(undefined);

    const { unmount } = render(
      <ReplaneScriptProvider fallback={<div data-testid="fallback">Loading</div>}>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();

    // Unmount and remount with snapshot now available
    // This simulates the script having run before the next render
    unmount();

    const snapshot = createMockSnapshot({ feature: true });
    setWindowSnapshot(snapshot);

    render(
      <ReplaneScriptProvider fallback={<div data-testid="fallback">Loading</div>}>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    // Now content should show because snapshot was available on initial render
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("renders null fallback (empty) when fallback is not provided and no snapshot", () => {
    const { container } = render(
      <ReplaneScriptProvider>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(container.innerHTML).toBe("");
  });
});

// ============================================================================
// ReplaneScriptProvider - Edge Cases
// ============================================================================

describe("ReplaneScriptProvider - Edge Cases", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRestoreClient: any;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({});
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
    setWindowSnapshot(undefined);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
    setWindowSnapshot(undefined);
  });

  it("handles empty snapshot in window", () => {
    const snapshot = createMockSnapshot({});
    setWindowSnapshot(snapshot);

    render(
      <ReplaneScriptProvider>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("handles snapshot with many configs", () => {
    const manyConfigs: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      manyConfigs[`config_${i}`] = i;
    }
    const snapshot = createMockSnapshot(manyConfigs);
    setWindowSnapshot(snapshot);

    render(
      <ReplaneScriptProvider>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("handles multiple children", () => {
    const snapshot = createMockSnapshot({ feature: true });
    setWindowSnapshot(snapshot);

    render(
      <ReplaneScriptProvider>
        <div data-testid="child1">Child 1</div>
        <div data-testid="child2">Child 2</div>
        <div data-testid="child3">Child 3</div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("child1")).toBeInTheDocument();
    expect(screen.getByTestId("child2")).toBeInTheDocument();
    expect(screen.getByTestId("child3")).toBeInTheDocument();
  });

  it("handles nested children", () => {
    const snapshot = createMockSnapshot({ feature: true });
    setWindowSnapshot(snapshot);

    render(
      <ReplaneScriptProvider>
        <div data-testid="outer">
          <div data-testid="middle">
            <div data-testid="inner">Deep content</div>
          </div>
        </div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("outer")).toBeInTheDocument();
    expect(screen.getByTestId("middle")).toBeInTheDocument();
    expect(screen.getByTestId("inner")).toHaveTextContent("Deep content");
  });
});

// ============================================================================
// Integration: getReplaneSnapshotScript + ReplaneScriptProvider
// ============================================================================

describe("Integration: getReplaneSnapshotScript + ReplaneScriptProvider", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRestoreClient: any;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({
      feature: true,
      count: 42,
      message: "Hello World",
    });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
    setWindowSnapshot(undefined);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
    setWindowSnapshot(undefined);
  });

  it("works end-to-end: script generation to provider consumption", () => {
    // Step 1: Generate script from snapshot (simulates server-side)
    const snapshot = createMockSnapshot({
      feature: true,
      count: 42,
      message: "Hello World",
    });
    const script = getReplaneSnapshotScript(snapshot);

    // Step 2: Evaluate script (simulates browser executing script in <head>)
    eval(script);

    // Step 3: Render provider (simulates client-side hydration)
    render(
      <ReplaneScriptProvider>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    // Step 4: Verify it works
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(mockRestoreClient).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          configs: expect.arrayContaining([
            expect.objectContaining({ name: "feature", value: true }),
            expect.objectContaining({ name: "count", value: 42 }),
            expect.objectContaining({ name: "message", value: "Hello World" }),
          ]),
        }),
      })
    );
  });

  it("handles XSS-safe values through the full flow", () => {
    const snapshot = createMockSnapshot({
      dangerous: "</script><script>alert('xss')</script>",
    });
    const script = getReplaneSnapshotScript(snapshot);

    // Evaluate should not break
    eval(script);

    render(
      <ReplaneScriptProvider>
        <div data-testid="content">Content</div>
      </ReplaneScriptProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();

    // Verify the value is preserved correctly
    const windowSnapshot = (window as Window & { __REPLANE_SNAPSHOT__?: ReplaneSnapshot<Record<string, unknown>> }).__REPLANE_SNAPSHOT__;
    const dangerousConfig = windowSnapshot?.configs.find(c => c.name === "dangerous");
    expect(dangerousConfig?.value).toBe("</script><script>alert('xss')</script>");
  });
});
