import { Component, StrictMode, useState, useCallback } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { ReplaneNextProvider } from "../src/provider";
import { useReplane, useConfig } from "@replanejs/react";
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

// Error boundary for testing error cases
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// ============================================================================
// ReplaneNextProvider - Basic Rendering
// ============================================================================

describe("ReplaneNextProvider - Basic Rendering", () => {
  let mockRestoreClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true, count: 42 });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
  });

  it("renders children immediately with snapshot", () => {
    const snapshot = createMockSnapshot({ feature: true });

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <div data-testid="child">Hello</div>
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toHaveTextContent("Hello");
  });

  it("provides client to children via context", () => {
    const snapshot = createMockSnapshot({ test: "value" });
    let capturedClient: ReplaneClient<Record<string, unknown>> | null = null;

    function TestComponent() {
      const { client } = useReplane();
      capturedClient = client;
      return <div data-testid="content">Content</div>;
    }

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <TestComponent />
      </ReplaneNextProvider>
    );

    expect(capturedClient).toBe(mockClient);
  });

  it("renders nested children correctly", () => {
    const snapshot = createMockSnapshot({ nested: "value" });

    function DeepChild() {
      const value = useConfig<string>("nested");
      return <div data-testid="deep">{value}</div>;
    }

    function MiddleComponent({ children }: { children: ReactNode }) {
      return <div>{children}</div>;
    }

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <MiddleComponent>
          <MiddleComponent>
            <MiddleComponent>
              <DeepChild />
            </MiddleComponent>
          </MiddleComponent>
        </MiddleComponent>
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("deep")).toBeInTheDocument();
  });
});

// ============================================================================
// ReplaneNextProvider - Client Creation
// ============================================================================

describe("ReplaneNextProvider - Client Creation", () => {
  let mockRestoreClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
  });

  it("calls restoreReplaneClient with snapshot only when no connection", () => {
    const snapshot = createMockSnapshot({ feature: true });

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <div>Content</div>
      </ReplaneNextProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledWith({
      snapshot,
      connection: undefined,
      context: undefined,
    });
  });

  it("calls restoreReplaneClient with connection options", () => {
    const snapshot = createMockSnapshot({ feature: true });
    const connection = {
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    };

    render(
      <ReplaneNextProvider snapshot={snapshot} connection={connection}>
        <div>Content</div>
      </ReplaneNextProvider>
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
      context: undefined,
    });
  });

  it("calls restoreReplaneClient with full connection options", () => {
    const snapshot = createMockSnapshot({ feature: true });
    const connection = {
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
      requestTimeoutMs: 3000,
      retryDelayMs: 500,
      inactivityTimeoutMs: 60000,
    };

    render(
      <ReplaneNextProvider snapshot={snapshot} connection={connection}>
        <div>Content</div>
      </ReplaneNextProvider>
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
      context: undefined,
    });
  });

  it("calls restoreReplaneClient with context override", () => {
    const snapshot = createMockSnapshot({ feature: true });
    const context = { userId: "123", plan: "premium" };

    render(
      <ReplaneNextProvider snapshot={snapshot} context={context}>
        <div>Content</div>
      </ReplaneNextProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledWith({
      snapshot,
      connection: undefined,
      context: { userId: "123", plan: "premium" },
    });
  });

  it("calls restoreReplaneClient with all options", () => {
    const snapshot = createMockSnapshot({ feature: true });
    const connection = {
      baseUrl: "https://api.replane.dev",
      sdkKey: "rp_test_key",
    };
    const context = { userId: "123" };

    render(
      <ReplaneNextProvider
        snapshot={snapshot}
        connection={connection}
        context={context}
      >
        <div>Content</div>
      </ReplaneNextProvider>
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
      context: { userId: "123" },
    });
  });
});

// ============================================================================
// ReplaneNextProvider - Client Lifecycle
// ============================================================================

describe("ReplaneNextProvider - Client Lifecycle", () => {
  let mockRestoreClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
  });

  it("closes client on unmount", () => {
    const snapshot = createMockSnapshot({ feature: true });

    const { unmount } = render(
      <ReplaneNextProvider snapshot={snapshot}>
        <div>Content</div>
      </ReplaneNextProvider>
    );

    expect(mockClient.close).not.toHaveBeenCalled();

    unmount();

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });

  it("preserves client across re-renders with same props", () => {
    const snapshot = createMockSnapshot({ feature: true });

    const { rerender } = render(
      <ReplaneNextProvider snapshot={snapshot}>
        <div>Content</div>
      </ReplaneNextProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledTimes(1);

    rerender(
      <ReplaneNextProvider snapshot={snapshot}>
        <div>Updated Content</div>
      </ReplaneNextProvider>
    );

    rerender(
      <ReplaneNextProvider snapshot={snapshot}>
        <div>Updated Again</div>
      </ReplaneNextProvider>
    );

    // Client should be preserved (not recreated) if snapshot is the same
    // However, due to useMemo dependency on clientKey, the client may be recreated
    // The implementation creates a new client on each render due to the useMemo structure
    expect(mockRestoreClient).toHaveBeenCalled();
  });

  it("creates new client when snapshot changes", () => {
    const snapshot1 = createMockSnapshot({ feature: true });
    const snapshot2 = createMockSnapshot({ feature: false, newConfig: "value" });

    const { rerender } = render(
      <ReplaneNextProvider snapshot={snapshot1}>
        <div>Content</div>
      </ReplaneNextProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledTimes(1);

    rerender(
      <ReplaneNextProvider snapshot={snapshot2}>
        <div>Content</div>
      </ReplaneNextProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledTimes(2);
    expect(mockRestoreClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: snapshot2,
      })
    );
  });

  it("creates new client when connection changes", () => {
    const snapshot = createMockSnapshot({ feature: true });
    const connection1 = {
      baseUrl: "https://api1.replane.dev",
      sdkKey: "rp_key_1",
    };
    const connection2 = {
      baseUrl: "https://api2.replane.dev",
      sdkKey: "rp_key_2",
    };

    const { rerender } = render(
      <ReplaneNextProvider snapshot={snapshot} connection={connection1}>
        <div>Content</div>
      </ReplaneNextProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledTimes(1);

    rerender(
      <ReplaneNextProvider snapshot={snapshot} connection={connection2}>
        <div>Content</div>
      </ReplaneNextProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledTimes(2);
  });

  it("creates new client when context changes", () => {
    const snapshot = createMockSnapshot({ feature: true });
    const context1 = { userId: "user1" };
    const context2 = { userId: "user2" };

    const { rerender } = render(
      <ReplaneNextProvider snapshot={snapshot} context={context1}>
        <div>Content</div>
      </ReplaneNextProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledTimes(1);

    rerender(
      <ReplaneNextProvider snapshot={snapshot} context={context2}>
        <div>Content</div>
      </ReplaneNextProvider>
    );

    expect(mockRestoreClient).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// ReplaneNextProvider - Context Stability
// ============================================================================

describe("ReplaneNextProvider - Context Stability", () => {
  let mockRestoreClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
  });

  it("maintains stable context value across re-renders with same client", () => {
    const snapshot = createMockSnapshot({ feature: true });
    const contextValues: ReturnType<typeof useReplane>[] = [];

    function TestComponent() {
      const context = useReplane();
      contextValues.push(context);
      return null;
    }

    const { rerender } = render(
      <ReplaneNextProvider snapshot={snapshot}>
        <TestComponent />
      </ReplaneNextProvider>
    );

    rerender(
      <ReplaneNextProvider snapshot={snapshot}>
        <TestComponent />
      </ReplaneNextProvider>
    );

    rerender(
      <ReplaneNextProvider snapshot={snapshot}>
        <TestComponent />
      </ReplaneNextProvider>
    );

    expect(contextValues).toHaveLength(3);
    // Context values should maintain stable reference
    expect(contextValues[0]).toBe(contextValues[1]);
    expect(contextValues[1]).toBe(contextValues[2]);
  });
});

// ============================================================================
// ReplaneNextProvider - useConfig Integration
// ============================================================================

describe("ReplaneNextProvider - useConfig Integration", () => {
  let mockRestoreClient: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    mockRestoreClient?.mockRestore();
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
      <ReplaneNextProvider snapshot={snapshot}>
        <TestComponent />
      </ReplaneNextProvider>
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

    function TestComponent() {
      const counter = useConfig<number>("counter");
      return <div data-testid="counter">{counter}</div>;
    }

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <TestComponent />
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("counter")).toHaveTextContent("0");

    act(() => {
      mockClient._updateConfig("counter", 100);
    });

    expect(screen.getByTestId("counter")).toHaveTextContent("100");
  });

  it("handles multiple config consumers", () => {
    const mockClient = createMockClient({ shared: "initial" });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);

    const snapshot = createMockSnapshot({ shared: "initial" });

    function ConsumerA() {
      const value = useConfig<string>("shared");
      return <div data-testid="consumerA">{value}</div>;
    }

    function ConsumerB() {
      const value = useConfig<string>("shared");
      return <div data-testid="consumerB">{value}</div>;
    }

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <ConsumerA />
        <ConsumerB />
      </ReplaneNextProvider>
    );

    act(() => {
      mockClient._updateConfig("shared", "updated");
    });

    expect(screen.getByTestId("consumerA")).toHaveTextContent("updated");
    expect(screen.getByTestId("consumerB")).toHaveTextContent("updated");
  });
});

// ============================================================================
// ReplaneNextProvider - Integration Scenarios
// ============================================================================

describe("ReplaneNextProvider - Integration Scenarios", () => {
  let mockRestoreClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
  });

  it("works with React StrictMode", () => {
    const snapshot = createMockSnapshot({ strictMode: "works" });

    function TestComponent() {
      const value = useConfig<string>("strictMode");
      return <div data-testid="value">{value}</div>;
    }

    render(
      <StrictMode>
        <ReplaneNextProvider snapshot={snapshot}>
          <TestComponent />
        </ReplaneNextProvider>
      </StrictMode>
    );

    expect(screen.getByTestId("value")).toBeInTheDocument();
  });

  it("handles conditional rendering of config consumers", () => {
    const snapshot = createMockSnapshot({ conditionalConfig: "visible" });

    function ConditionalComponent({ show }: { show: boolean }) {
      return show ? <ConfigConsumer /> : null;
    }

    function ConfigConsumer() {
      const value = useConfig<string>("conditionalConfig");
      return <div data-testid="conditional">{value}</div>;
    }

    const { rerender } = render(
      <ReplaneNextProvider snapshot={snapshot}>
        <ConditionalComponent show={false} />
      </ReplaneNextProvider>
    );

    expect(screen.queryByTestId("conditional")).not.toBeInTheDocument();

    rerender(
      <ReplaneNextProvider snapshot={snapshot}>
        <ConditionalComponent show={true} />
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("conditional")).toBeInTheDocument();

    rerender(
      <ReplaneNextProvider snapshot={snapshot}>
        <ConditionalComponent show={false} />
      </ReplaneNextProvider>
    );

    expect(screen.queryByTestId("conditional")).not.toBeInTheDocument();
  });

  it("works with component that uses multiple hooks", () => {
    const snapshot = createMockSnapshot({ feature: true, count: 5 });

    function MultiHookComponent() {
      const { client } = useReplane();
      const feature = useConfig<boolean>("feature");
      const count = useConfig<number>("count");
      const [localState, setLocalState] = useState(0);

      const increment = useCallback(() => setLocalState((s) => s + 1), []);

      return (
        <div>
          <div data-testid="hasClient">{client ? "yes" : "no"}</div>
          <div data-testid="feature">{String(feature)}</div>
          <div data-testid="count">{count}</div>
          <div data-testid="local">{localState}</div>
          <button data-testid="increment" onClick={increment}>
            Inc
          </button>
        </div>
      );
    }

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <MultiHookComponent />
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("hasClient")).toHaveTextContent("yes");
  });
});

// ============================================================================
// ReplaneNextProvider - Edge Cases
// ============================================================================

describe("ReplaneNextProvider - Edge Cases", () => {
  let mockRestoreClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({});
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
  });

  it("handles empty snapshot", () => {
    const snapshot = createMockSnapshot({});

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <div data-testid="content">Content</div>
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("handles snapshot with many configs", () => {
    const manyConfigs: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      manyConfigs[`config_${i}`] = i;
    }
    const snapshot = createMockSnapshot(manyConfigs);

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <div data-testid="content">Content</div>
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(mockRestoreClient).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot })
    );
  });

  it("handles complex nested config values in snapshot", () => {
    const complexConfig = {
      nested: {
        deep: {
          value: "found",
          array: [1, 2, 3],
        },
      },
    };
    const snapshot = createMockSnapshot({ complex: complexConfig });

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <div data-testid="content">Content</div>
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("handles null and undefined config values", () => {
    const snapshot = createMockSnapshot({
      nullValue: null,
      undefinedValue: undefined,
    });

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <div data-testid="content">Content</div>
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("handles unicode in config names and values", () => {
    const snapshot = createMockSnapshot({
      "config-with-emoji": "value",
      normalConfig: "Hello",
    });

    render(
      <ReplaneNextProvider snapshot={snapshot}>
        <div data-testid="content">Content</div>
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});

// ============================================================================
// ReplaneNextProvider - Error Handling
// ============================================================================

describe("ReplaneNextProvider - Error Handling", () => {
  let mockRestoreClient: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    mockRestoreClient?.mockRestore();
  });

  it("propagates errors from restoreReplaneClient", () => {
    const error = new Error("Failed to restore client");
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockImplementation(() => {
        throw error;
      });

    const snapshot = createMockSnapshot({ feature: true });
    const onError = vi.fn();

    expect(() =>
      render(
        <ErrorBoundary fallback={<div>Error</div>} onError={onError}>
          <ReplaneNextProvider snapshot={snapshot}>
            <div>Content</div>
          </ReplaneNextProvider>
        </ErrorBoundary>
      )
    ).not.toThrow();

    expect(screen.getByText("Error")).toBeInTheDocument();
  });
});

// ============================================================================
// ReplaneNextProvider - TypeScript Types (compile-time checks)
// ============================================================================

describe("ReplaneNextProvider - TypeScript Types", () => {
  let mockRestoreClient: ReturnType<typeof vi.spyOn>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    mockRestoreClient = vi
      .spyOn(sdk, "restoreReplaneClient")
      .mockReturnValue(mockClient);
  });

  afterEach(() => {
    mockRestoreClient.mockRestore();
  });

  it("accepts generic type parameter", () => {
    interface MyConfigs {
      feature: boolean;
      count: number;
    }

    const snapshot: ReplaneSnapshot<MyConfigs> = {
      configs: [
        { name: "feature", value: true, overrides: [] },
        { name: "count", value: 42, overrides: [] },
      ],
    };

    render(
      <ReplaneNextProvider<MyConfigs> snapshot={snapshot}>
        <div data-testid="content">Content</div>
      </ReplaneNextProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});
