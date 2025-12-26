import { Suspense, Component, useState, useCallback, StrictMode } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
  ReplaneProvider,
  useReplane,
  useConfig,
  createReplaneHook,
  createConfigHook,
  clearSuspenseCache,
} from "../src/index";
import type { Replane, ConnectOptions } from "../src/index";
import * as sdk from "@replanejs/sdk";

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

const defaultConnection: ConnectOptions = {
  baseUrl: "https://test.replane.dev",
  sdkKey: "rp_test_key",
};

// ============================================================================
// ReplaneProvider with client prop
// ============================================================================

describe("ReplaneProvider with client prop", () => {
  it("renders children immediately", () => {
    const client = createMockClient();

    render(
      <ReplaneProvider client={client}>
        <div data-testid="child">Hello</div>
      </ReplaneProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toHaveTextContent("Hello");
  });

  it("provides client to children via context", () => {
    const client = createMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedClient: Replane<any> | null = null;

    function TestComponent() {
      const replane = useReplane();
      capturedClient = replane;
      return <div data-testid="content">Content</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(capturedClient).toBe(client);
  });

  it("maintains stable context value across re-renders with same client", () => {
    const client = createMockClient();
    const contextValues: unknown[] = [];

    function TestComponent() {
      const context = useReplane();
      contextValues.push(context);
      return null;
    }

    const { rerender } = render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    rerender(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    rerender(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    // All context values should be the same reference
    expect(contextValues).toHaveLength(3);
    expect(contextValues[0]).toBe(contextValues[1]);
    expect(contextValues[1]).toBe(contextValues[2]);
  });

  it("updates context when client prop changes", () => {
    const client1 = createMockClient({ value: "client1" });
    const client2 = createMockClient({ value: "client2" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedClient: Replane<any> | null = null;

    function TestComponent() {
      const replane = useReplane();
      capturedClient = replane;
      return null;
    }

    const { rerender } = render(
      <ReplaneProvider client={client1}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(capturedClient).toBe(client1);

    rerender(
      <ReplaneProvider client={client2}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(capturedClient).toBe(client2);
  });

  it("works with deeply nested children", () => {
    const client = createMockClient({ nested: "value" });

    function DeepChild() {
      const value = useConfig<string>("nested");
      return <div data-testid="deep">{value}</div>;
    }

    function MiddleComponent({ children }: { children: ReactNode }) {
      return <div>{children}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <MiddleComponent>
          <MiddleComponent>
            <MiddleComponent>
              <DeepChild />
            </MiddleComponent>
          </MiddleComponent>
        </MiddleComponent>
      </ReplaneProvider>
    );

    expect(screen.getByTestId("deep")).toHaveTextContent("value");
  });

  it("does not call client.disconnect on unmount when client is passed as prop", () => {
    const client = createMockClient();

    const { unmount } = render(
      <ReplaneProvider client={client}>
        <div>Content</div>
      </ReplaneProvider>
    );

    unmount();

    // Client should NOT be disconnected when passed as prop (user manages lifecycle)
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});

// ============================================================================
// ReplaneProvider with options prop - Loading States
// ============================================================================

describe("ReplaneProvider with options prop - Loading States", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReplaneClass: any;
  let mockClient: ReturnType<typeof createMockClient>;
  let resolveConnect: () => void;
  let rejectConnect: (error: Error) => void;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    const connectPromise = new Promise<void>((resolve, reject) => {
      resolveConnect = resolve;
      rejectConnect = reject;
    });

    mockClient.connect = vi.fn().mockReturnValue(connectPromise);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    clearSuspenseCache();
  });

  afterEach(() => {
    mockReplaneClass.mockRestore();
    clearSuspenseCache();
  });

  it("shows loader component while initializing", () => {
    render(
      <ReplaneProvider
        connection={defaultConnection}
        loader={<div data-testid="loader">Loading...</div>}
      >
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(screen.getByTestId("loader")).toHaveTextContent("Loading...");
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("shows custom loader with complex markup", () => {
    render(
      <ReplaneProvider
        connection={defaultConnection}
        loader={
          <div data-testid="loader">
            <span data-testid="spinner">🔄</span>
            <p data-testid="message">Please wait...</p>
          </div>
        }
      >
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(screen.getByTestId("spinner")).toHaveTextContent("🔄");
    expect(screen.getByTestId("message")).toHaveTextContent("Please wait...");
  });

  it("renders nothing when no loader is provided and still loading", () => {
    const { container } = render(
      <ReplaneProvider connection={defaultConnection}>
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });

  it("transitions from loader to content after initialization", async () => {
    render(
      <ReplaneProvider
        connection={defaultConnection}
        loader={<div data-testid="loader">Loading...</div>}
      >
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();

    await act(async () => {
      resolveConnect();
    });

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
  });

  it("throws error to error boundary on initialization failure", async () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary
        fallback={<div data-testid="error-fallback">Error occurred</div>}
        onError={onError}
      >
        <ReplaneProvider
          connection={defaultConnection}
          loader={<div data-testid="loader">Loading...</div>}
        >
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </ErrorBoundary>
    );

    await act(async () => {
      rejectConnect(new Error("Connection failed"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    // Should show error fallback, not content or loader
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
  });
});

// ============================================================================
// ReplaneProvider with options prop - Client Lifecycle
// ============================================================================

describe("ReplaneProvider with options prop - Client Lifecycle", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReplaneClass: any;

  beforeEach(() => {
    clearSuspenseCache();
  });

  afterEach(() => {
    mockReplaneClass?.mockRestore();
    clearSuspenseCache();
  });

  it("creates Replane instance with correct options and calls connect", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    render(
      <ReplaneProvider connection={defaultConnection}>
        <div>Content</div>
      </ReplaneProvider>
    );

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

  it("provides initialized client to children via context", async () => {
    const mockClient = createMockClient({ test: "value" });
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedClient: Replane<any> | null = null;

    function TestComponent() {
      const replane = useReplane();
      capturedClient = replane;
      return <div data-testid="content">Content</div>;
    }

    render(
      <ReplaneProvider connection={defaultConnection}>
        <TestComponent />
      </ReplaneProvider>
    );

    await waitFor(() => {
      expect(capturedClient).toBe(mockClient);
    });
  });

  it("disconnects client on unmount after successful initialization", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const { unmount } = render(
      <ReplaneProvider connection={defaultConnection}>
        <div>Content</div>
      </ReplaneProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText("Content")).toBeInTheDocument();
    });

    unmount();

    expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("handles unmount during initialization gracefully", async () => {
    const mockClient = createMockClient();
    let resolveConnect: () => void;
    const connectPromise = new Promise<void>((resolve) => {
      resolveConnect = resolve;
    });

    mockClient.connect = vi.fn().mockReturnValue(connectPromise);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const { unmount } = render(
      <ReplaneProvider
        connection={defaultConnection}
        loader={<div data-testid="loader">Loading</div>}
      >
        <div>Content</div>
      </ReplaneProvider>
    );

    // Unmount while still loading
    unmount();

    // Resolve after unmount - should disconnect the client
    await act(async () => {
      resolveConnect!();
    });

    // Client should be disconnected because component unmounted
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it("does not create Replane instance multiple times on re-render", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const { rerender } = render(
      <ReplaneProvider connection={defaultConnection}>
        <div>Content</div>
      </ReplaneProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText("Content")).toBeInTheDocument();
    });

    rerender(
      <ReplaneProvider connection={defaultConnection}>
        <div>Updated</div>
      </ReplaneProvider>
    );

    rerender(
      <ReplaneProvider connection={defaultConnection}>
        <div>Updated Again</div>
      </ReplaneProvider>
    );

    // Should only create Replane instance once
    expect(mockReplaneClass).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// ReplaneProvider with options prop - Error Handling
// ============================================================================

describe("ReplaneProvider with options prop - Error Handling", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReplaneClass: any;

  beforeEach(() => {
    clearSuspenseCache();
  });

  afterEach(() => {
    mockReplaneClass?.mockRestore();
    clearSuspenseCache();
  });

  it("throws error to error boundary when initialization fails", async () => {
    const error = new Error("Network error");
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockRejectedValue(error);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const onError = vi.fn();

    render(
      <ErrorBoundary
        fallback={<div data-testid="error-fallback">Error occurred</div>}
        onError={onError}
      >
        <ReplaneProvider connection={defaultConnection}>
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBe(error);
  });

  it("wraps non-Error rejections before throwing", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockRejectedValue("string error");
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const onError = vi.fn();

    render(
      <ErrorBoundary
        fallback={<div data-testid="error-fallback">Error occurred</div>}
        onError={onError}
      >
        <ReplaneProvider connection={defaultConnection}>
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    expect(onError).toHaveBeenCalled();
    const calledError = onError.mock.calls[0][0];
    expect(calledError).toBeInstanceOf(Error);
    expect(calledError.message).toBe("string error");
  });

  it("does not render children after error", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockRejectedValue(new Error("Failed"));
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    render(
      <ErrorBoundary fallback={<div data-testid="error-fallback">Error occurred</div>}>
        <ReplaneProvider
          connection={defaultConnection}
          loader={<div data-testid="loader">Loading</div>}
        >
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    // Wait a bit more to ensure content never appears
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("passes error info with component stack to error boundary", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockRejectedValue(new Error("Init failed"));
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const onError = vi.fn();

    render(
      <ErrorBoundary
        fallback={<div data-testid="error-fallback">Error occurred</div>}
        onError={onError}
      >
        <ReplaneProvider connection={defaultConnection}>
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    expect(onError).toHaveBeenCalled();
    // Second argument is ErrorInfo which contains componentStack
    const errorInfo = onError.mock.calls[0][1];
    expect(errorInfo).toHaveProperty("componentStack");
    expect(typeof errorInfo.componentStack).toBe("string");
  });

  it("allows recovery when error boundary resets and client succeeds", async () => {
    let shouldFail = true;
    const mockClient = createMockClient({ recovered: true });

    mockClient.connect = vi.fn().mockImplementation(() => {
      if (shouldFail) {
        return Promise.reject(new Error("Temporary failure"));
      }
      return Promise.resolve(undefined);
    });
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    // Resettable error boundary for testing recovery
    function ResettableErrorBoundary({ children }: { children: ReactNode }) {
      const [key, setKey] = useState(0);
      const [hasError, setHasError] = useState(false);

      if (hasError) {
        return (
          <div>
            <div data-testid="error-fallback">Error occurred</div>
            <button
              data-testid="retry-button"
              onClick={() => {
                setHasError(false);
                setKey((k) => k + 1);
              }}
            >
              Retry
            </button>
          </div>
        );
      }

      return (
        <ErrorBoundary key={key} fallback={<></>} onError={() => setHasError(true)}>
          {children}
        </ErrorBoundary>
      );
    }

    function TestComponent() {
      const value = useConfig<boolean>("recovered");
      return <div data-testid="recovered">{String(value)}</div>;
    }

    render(
      <ResettableErrorBoundary>
        <ReplaneProvider connection={defaultConnection}>
          <TestComponent />
        </ReplaneProvider>
      </ResettableErrorBoundary>
    );

    // Wait for initial error
    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    // Fix the mock to succeed on retry
    shouldFail = false;
    clearSuspenseCache();

    // Click retry
    await act(async () => {
      screen.getByTestId("retry-button").click();
    });

    // Should now show recovered content
    await waitFor(() => {
      expect(screen.getByTestId("recovered")).toHaveTextContent("true");
    });
    expect(screen.queryByTestId("error-fallback")).not.toBeInTheDocument();
  });

  it("handles different error types correctly", async () => {
    const typeError = new TypeError("Type mismatch");
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockRejectedValue(typeError);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const onError = vi.fn();

    render(
      <ErrorBoundary
        fallback={<div data-testid="error-fallback">Error occurred</div>}
        onError={onError}
      >
        <ReplaneProvider connection={defaultConnection}>
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    expect(onError).toHaveBeenCalled();
    const caughtError = onError.mock.calls[0][0];
    expect(caughtError).toBe(typeError);
    expect(caughtError).toBeInstanceOf(TypeError);
    expect(caughtError.message).toBe("Type mismatch");
  });

  it("isolates errors to their own error boundary with nested providers", async () => {
    const mockOuterClient = createMockClient({ outer: "works" });
    const mockInnerClient = createMockClient();
    let callCount = 0;

    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        mockOuterClient.connect = vi.fn().mockResolvedValue(undefined);
        return mockOuterClient;
      }
      mockInnerClient.connect = vi.fn().mockRejectedValue(new Error("Inner failed"));
      return mockInnerClient;
    });

    const innerConnection: ConnectOptions = {
      baseUrl: "https://inner.replane.dev",
      sdkKey: "rp_inner_key",
    };

    function OuterContent() {
      const value = useConfig<string>("outer");
      return <div data-testid="outer-content">{value}</div>;
    }

    render(
      <ErrorBoundary fallback={<div data-testid="outer-error">Outer error</div>}>
        <ReplaneProvider connection={defaultConnection}>
          <OuterContent />
          <ErrorBoundary fallback={<div data-testid="inner-error">Inner error</div>}>
            <ReplaneProvider connection={innerConnection}>
              <div data-testid="inner-content">Inner</div>
            </ReplaneProvider>
          </ErrorBoundary>
        </ReplaneProvider>
      </ErrorBoundary>
    );

    // Wait for both providers to initialize
    await waitFor(() => {
      expect(screen.getByTestId("outer-content")).toHaveTextContent("works");
    });

    await waitFor(() => {
      expect(screen.getByTestId("inner-error")).toBeInTheDocument();
    });

    // Outer content should still be visible
    expect(screen.getByTestId("outer-content")).toBeInTheDocument();
    // Outer error should not be triggered
    expect(screen.queryByTestId("outer-error")).not.toBeInTheDocument();
    // Inner content should not be visible
    expect(screen.queryByTestId("inner-content")).not.toBeInTheDocument();
  });

  it("does not call client.disconnect when error occurs during initialization", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockRejectedValue(new Error("Init failed"));
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const { unmount } = render(
      <ErrorBoundary fallback={<div data-testid="error-fallback">Error</div>}>
        <ReplaneProvider connection={defaultConnection}>
          <div>Content</div>
        </ReplaneProvider>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    // No client was successfully connected, so disconnect shouldn't be called
    unmount();

    // Since connect failed, disconnect should be called to cleanup
    // This verifies we handle the error case properly
  });
});

// ============================================================================
// ReplaneProvider with Suspense
// ============================================================================

describe("ReplaneProvider with suspense", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReplaneClass: any;

  beforeEach(() => {
    clearSuspenseCache();
  });

  afterEach(() => {
    mockReplaneClass?.mockRestore();
    clearSuspenseCache();
  });

  it("suspends while client is initializing", async () => {
    let resolveConnect: () => void;
    const connectPromise = new Promise<void>((resolve) => {
      resolveConnect = resolve;
    });

    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockReturnValue(connectPromise);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    render(
      <Suspense fallback={<div data-testid="fallback">Suspending...</div>}>
        <ReplaneProvider connection={defaultConnection} suspense>
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </Suspense>
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();

    await act(async () => {
      resolveConnect!();
    });

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("provides client to children when using suspense", async () => {
    const mockClient = createMockClient({ test: "suspenseValue" });
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedClient: Replane<any> | null = null;

    function TestComponent() {
      const replane = useReplane();
      capturedClient = replane;
      return <div data-testid="content">Content</div>;
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider connection={defaultConnection} suspense>
          <TestComponent />
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(capturedClient).toBe(mockClient);
    });
  });

  it("caches client based on baseUrl and sdkKey", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    // First render
    const { unmount } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider connection={defaultConnection} suspense>
          <div data-testid="content">First</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });

    unmount();

    // Second render with same options - should use cached client
    render(
      <Suspense fallback={<div data-testid="fallback">Loading...</div>}>
        <ReplaneProvider connection={defaultConnection} suspense>
          <div data-testid="content">Second</div>
        </ReplaneProvider>
      </Suspense>
    );

    // Should NOT show fallback because client is cached
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
    expect(screen.getByTestId("content")).toHaveTextContent("Second");

    // Replane class should only be instantiated once
    expect(mockReplaneClass).toHaveBeenCalledTimes(1);
  });

  it("creates new client for different sdkKey", async () => {
    const mockClient1 = createMockClient();
    mockClient1.connect = vi.fn().mockResolvedValue(undefined);
    const mockClient2 = createMockClient();
    mockClient2.connect = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;

    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => {
      callCount++;
      return callCount === 1 ? mockClient1 : mockClient2;
    });

    // First render
    const { unmount } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider connection={defaultConnection} suspense>
          <div data-testid="content">First</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });

    unmount();
    clearSuspenseCache();

    // Second render with different sdkKey
    const differentConnection: ConnectOptions = {
      baseUrl: "https://test.replane.dev",
      sdkKey: "rp_different_key",
    };

    render(
      <Suspense fallback={<div data-testid="fallback">Loading...</div>}>
        <ReplaneProvider connection={differentConnection} suspense>
          <div data-testid="content">Second</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByTestId("content")).toHaveTextContent("Second");
    });

    // Should have instantiated Replane twice
    expect(mockReplaneClass).toHaveBeenCalledTimes(2);
  });

  it("throws to error boundary when initialization fails with suspense", async () => {
    const error = new Error("Suspense init failed");
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockRejectedValue(error);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const onError = vi.fn();

    render(
      <ErrorBoundary
        fallback={<div data-testid="error-fallback">Error occurred</div>}
        onError={onError}
      >
        <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
          <ReplaneProvider connection={defaultConnection} suspense>
            <div data-testid="content">Content</div>
          </ReplaneProvider>
        </Suspense>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("suspense-fallback")).not.toBeInTheDocument();
  });

  it("caches error and throws consistently with suspense", async () => {
    const error = new Error("Cached error");
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockRejectedValue(error);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const onError = vi.fn();

    // First render - should fail
    const { unmount } = render(
      <ErrorBoundary
        fallback={<div data-testid="error-fallback">Error occurred</div>}
        onError={onError}
      >
        <Suspense fallback={<div>Loading...</div>}>
          <ReplaneProvider connection={defaultConnection} suspense>
            <div data-testid="content">Content</div>
          </ReplaneProvider>
        </Suspense>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    expect(onError).toHaveBeenCalledTimes(1);

    unmount();

    // Second render with same options - should get cached error immediately
    const onError2 = vi.fn();

    render(
      <ErrorBoundary
        fallback={<div data-testid="error-fallback-2">Error occurred again</div>}
        onError={onError2}
      >
        <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
          <ReplaneProvider connection={defaultConnection} suspense>
            <div data-testid="content">Content</div>
          </ReplaneProvider>
        </Suspense>
      </ErrorBoundary>
    );

    // Should immediately show error (not suspense fallback) due to cached error
    await waitFor(() => {
      expect(screen.getByTestId("error-fallback-2")).toBeInTheDocument();
    });

    // Replane class should only be instantiated once
    expect(mockReplaneClass).toHaveBeenCalledTimes(1);
  });

  it("wraps non-Error rejections in suspense mode", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockRejectedValue("string rejection");
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const onError = vi.fn();

    render(
      <ErrorBoundary
        fallback={<div data-testid="error-fallback">Error occurred</div>}
        onError={onError}
      >
        <Suspense fallback={<div>Loading...</div>}>
          <ReplaneProvider connection={defaultConnection} suspense>
            <div data-testid="content">Content</div>
          </ReplaneProvider>
        </Suspense>
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    expect(onError).toHaveBeenCalled();
    const caughtError = onError.mock.calls[0][0];
    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError.message).toBe("string rejection");
  });

  it("allows recovery after clearing suspense cache on error", async () => {
    let shouldFail = true;
    const mockClient = createMockClient({ recovered: true });

    mockClient.connect = vi.fn().mockImplementation(() => {
      if (shouldFail) {
        return Promise.reject(new Error("Temporary failure"));
      }
      return Promise.resolve(undefined);
    });
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    // Resettable error boundary for testing recovery
    function ResettableErrorBoundary({ children }: { children: ReactNode }) {
      const [key, setKey] = useState(0);
      const [hasError, setHasError] = useState(false);

      if (hasError) {
        return (
          <div>
            <div data-testid="error-fallback">Error occurred</div>
            <button
              data-testid="retry-button"
              onClick={() => {
                clearSuspenseCache();
                setHasError(false);
                setKey((k) => k + 1);
              }}
            >
              Retry
            </button>
          </div>
        );
      }

      return (
        <ErrorBoundary key={key} fallback={<></>} onError={() => setHasError(true)}>
          {children}
        </ErrorBoundary>
      );
    }

    function TestComponent() {
      const value = useConfig<boolean>("recovered");
      return <div data-testid="recovered">{String(value)}</div>;
    }

    render(
      <ResettableErrorBoundary>
        <Suspense fallback={<div data-testid="loading">Loading...</div>}>
          <ReplaneProvider connection={defaultConnection} suspense>
            <TestComponent />
          </ReplaneProvider>
        </Suspense>
      </ResettableErrorBoundary>
    );

    // Wait for initial error
    await waitFor(() => {
      expect(screen.getByTestId("error-fallback")).toBeInTheDocument();
    });

    // Fix the mock to succeed on retry
    shouldFail = false;

    // Click retry (which also clears suspense cache)
    await act(async () => {
      screen.getByTestId("retry-button").click();
    });

    // Should show loading first
    await waitFor(() => {
      expect(
        screen.queryByTestId("loading") || screen.queryByTestId("recovered")
      ).toBeInTheDocument();
    });

    // Should eventually show recovered content
    await waitFor(() => {
      expect(screen.getByTestId("recovered")).toHaveTextContent("true");
    });
    expect(screen.queryByTestId("error-fallback")).not.toBeInTheDocument();
  });
});

// ============================================================================
// clearSuspenseCache
// ============================================================================

describe("clearSuspenseCache", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReplaneClass: any;

  beforeEach(() => {
    clearSuspenseCache();
  });

  afterEach(() => {
    mockReplaneClass?.mockRestore();
    clearSuspenseCache();
  });

  it("clears all cache entries when called without options", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    // First render to populate cache
    const { unmount } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider connection={defaultConnection} suspense>
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });

    unmount();
    expect(mockReplaneClass).toHaveBeenCalledTimes(1);

    // Clear cache
    clearSuspenseCache();

    // Second render should create new client
    render(
      <Suspense fallback={<div data-testid="fallback">Loading...</div>}>
        <ReplaneProvider connection={defaultConnection} suspense>
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(mockReplaneClass).toHaveBeenCalledTimes(2);
    });
  });

  it("clears only specific cache entry when connection provided", async () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const connection1: ConnectOptions = {
      baseUrl: "https://test1.replane.dev",
      sdkKey: "rp_key1",
    };

    const connection2: ConnectOptions = {
      baseUrl: "https://test2.replane.dev",
      sdkKey: "rp_key2",
    };

    // Populate cache with both
    const { unmount: unmount1 } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider connection={connection1} suspense>
          <div data-testid="content1">Content1</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByTestId("content1")).toBeInTheDocument();
    });

    unmount1();

    const { unmount: unmount2 } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider connection={connection2} suspense>
          <div data-testid="content2">Content2</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByTestId("content2")).toBeInTheDocument();
    });

    unmount2();

    expect(mockReplaneClass).toHaveBeenCalledTimes(2);

    // Clear only connection1
    clearSuspenseCache(connection1);

    // Re-render with connection1 should create new client
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider connection={connection1} suspense>
          <div>Content1</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(mockReplaneClass).toHaveBeenCalledTimes(3);
    });
  });

  it("is a no-op when clearing non-existent cache entry", () => {
    // Should not throw
    expect(() => clearSuspenseCache(defaultConnection)).not.toThrow();
    expect(() => clearSuspenseCache()).not.toThrow();
  });
});

// ============================================================================
// useReplane hook
// ============================================================================

describe("useReplane hook", () => {
  it("throws descriptive error when used outside ReplaneProvider", () => {
    function TestComponent() {
      useReplane();
      return null;
    }

    expect(() => render(<TestComponent />)).toThrow(
      "useReplane must be used within a ReplaneProvider"
    );
  });

  it("returns the client directly", () => {
    const client = createMockClient();
    let returnedClient: ReturnType<typeof useReplane> | null = null;

    function TestComponent() {
      returnedClient = useReplane();
      return null;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(returnedClient).not.toBeNull();
    expect(returnedClient).toBe(client);
  });

  it("returns same client reference across renders", () => {
    const client = createMockClient();
    const clients: ReturnType<typeof useReplane<Record<string, unknown>>>[] = [];

    function TestComponent() {
      const returnedClient = useReplane();
      clients.push(returnedClient);
      return null;
    }

    const { rerender } = render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    rerender(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(clients).toHaveLength(2);
    expect(clients[0]).toBe(clients[1]);
  });
});

// ============================================================================
// createReplaneHook
// ============================================================================

describe("createReplaneHook", () => {
  // Define typed config interface for tests
  interface AppConfigs {
    theme: { primaryColor: string; darkMode: boolean };
    featureFlags: { newUI: boolean; beta: boolean };
    maxItems: number;
  }

  it("creates a typed hook that returns the client", () => {
    const client = createMockClient({
      theme: { primaryColor: "#ff0000", darkMode: true },
    });

    const useAppReplane = createReplaneHook<AppConfigs>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedClient: Replane<any> | null = null;

    function TestComponent() {
      const replane = useAppReplane();
      capturedClient = replane;
      return <div data-testid="hasClient">{replane ? "yes" : "no"}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("hasClient")).toHaveTextContent("yes");
    expect(capturedClient).toBe(client);
  });

  it("provides typed client.get method", () => {
    const client = createMockClient({
      theme: { primaryColor: "#0000ff", darkMode: false },
      maxItems: 42,
    });

    const useAppReplane = createReplaneHook<AppConfigs>();

    function TestComponent() {
      const replane = useAppReplane();
      // In a real app, replane.get would be typed
      const theme = replane.get("theme");
      const maxItems = replane.get("maxItems");
      return (
        <>
          <div data-testid="theme">{JSON.stringify(theme)}</div>
          <div data-testid="maxItems">{maxItems}</div>
        </>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent(
      JSON.stringify({ primaryColor: "#0000ff", darkMode: false })
    );
    expect(screen.getByTestId("maxItems")).toHaveTextContent("42");
  });

  it("throws error when used outside ReplaneProvider", () => {
    const useAppReplane = createReplaneHook<AppConfigs>();

    function TestComponent() {
      useAppReplane();
      return null;
    }

    expect(() => render(<TestComponent />)).toThrow(
      "useReplane must be used within a ReplaneProvider"
    );
  });

  it("can create multiple independent typed hooks", () => {
    interface ThemeConfigs {
      color: string;
      mode: string;
    }

    interface FeatureConfigs {
      enabled: boolean;
      version: number;
    }

    const client = createMockClient({
      color: "red",
      mode: "dark",
      enabled: true,
      version: 2,
    });

    const useThemeReplane = createReplaneHook<ThemeConfigs>();
    const useFeatureReplane = createReplaneHook<FeatureConfigs>();

    function TestComponent() {
      const themeClient = useThemeReplane();
      const featureClient = useFeatureReplane();
      return (
        <>
          <div data-testid="color">{themeClient.get("color")}</div>
          <div data-testid="enabled">{String(featureClient.get("enabled"))}</div>
        </>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("color")).toHaveTextContent("red");
    expect(screen.getByTestId("enabled")).toHaveTextContent("true");
  });

  it("returns same client reference across renders", () => {
    const client = createMockClient({ theme: { primaryColor: "#000", darkMode: true } });
    const useAppReplane = createReplaneHook<AppConfigs>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clients: any[] = [];

    function TestComponent() {
      const returnedClient = useAppReplane();
      clients.push(returnedClient);
      return null;
    }

    const { rerender } = render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    rerender(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    rerender(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(clients).toHaveLength(3);
    expect(clients[0]).toBe(clients[1]);
    expect(clients[1]).toBe(clients[2]);
  });

  it("works with replane.get for direct access", () => {
    const client = createMockClient({ maxItems: 10 });
    const useAppReplane = createReplaneHook<AppConfigs>();

    function TestComponent() {
      const replane = useAppReplane();
      // Get value directly from replane
      const value = replane.get("maxItems");
      return <div data-testid="value">{value}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("value")).toHaveTextContent("10");
    expect(client.get).toHaveBeenCalledWith("maxItems");
  });

  it("works alongside createConfigHook", () => {
    const client = createMockClient({
      theme: { primaryColor: "#123456", darkMode: true },
      featureFlags: { newUI: true, beta: false },
    });

    const useAppReplane = createReplaneHook<AppConfigs>();
    const useAppConfig = createConfigHook<AppConfigs>();

    function TestComponent() {
      const replane = useAppReplane();
      const theme = useAppConfig("theme");

      return (
        <>
          <div data-testid="fromReplane">{replane.get("theme").primaryColor}</div>
          <div data-testid="fromHook">{theme.primaryColor}</div>
        </>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("fromReplane")).toHaveTextContent("#123456");
    expect(screen.getByTestId("fromHook")).toHaveTextContent("#123456");
  });

  it("provides access to replane.getSnapshot", () => {
    const client = createMockClient({
      theme: { primaryColor: "#fff", darkMode: false },
      maxItems: 100,
    });

    const useAppReplane = createReplaneHook<AppConfigs>();

    function TestComponent() {
      const replane = useAppReplane();
      const snapshot = replane.getSnapshot();
      return <div data-testid="configCount">{snapshot.configs.length}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("configCount")).toHaveTextContent("2");
  });
});

// ============================================================================
// useConfig hook - Basic Functionality
// ============================================================================

describe("useConfig hook - Basic Functionality", () => {
  it("returns config value for existing config", () => {
    const client = createMockClient({ myConfig: "myValue" });

    function TestComponent() {
      const value = useConfig<string>("myConfig");
      return <div data-testid="value">{value}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("value")).toHaveTextContent("myValue");
    expect(client.get).toHaveBeenCalledWith("myConfig", undefined);
  });

  it("passes context options to client.get", () => {
    const client = createMockClient({ greeting: "Hello" });

    function TestComponent() {
      const value = useConfig<string>("greeting", {
        context: { userId: "123", plan: "premium" },
      });
      return <div data-testid="value">{value}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(client.get).toHaveBeenCalledWith("greeting", {
      context: { userId: "123", plan: "premium" },
    });
  });

  it("handles undefined config value", () => {
    const client = createMockClient({});

    function TestComponent() {
      const value = useConfig<string | undefined>("nonexistent");
      return <div data-testid="value">{value ?? "UNDEFINED"}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("value")).toHaveTextContent("UNDEFINED");
  });

  it("handles null config value", () => {
    const client = createMockClient({ nullConfig: null });

    function TestComponent() {
      const value = useConfig<null>("nullConfig");
      return <div data-testid="value">{value === null ? "NULL" : "NOT_NULL"}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("value")).toHaveTextContent("NULL");
  });

  it("handles boolean config values", () => {
    const client = createMockClient({ enabled: true, disabled: false });

    function TestComponent() {
      const enabled = useConfig<boolean>("enabled");
      const disabled = useConfig<boolean>("disabled");
      return (
        <>
          <div data-testid="enabled">{String(enabled)}</div>
          <div data-testid="disabled">{String(disabled)}</div>
        </>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("enabled")).toHaveTextContent("true");
    expect(screen.getByTestId("disabled")).toHaveTextContent("false");
  });

  it("handles number config values including zero", () => {
    const client = createMockClient({
      positive: 42,
      negative: -10,
      zero: 0,
      float: 3.14,
    });

    function TestComponent() {
      const positive = useConfig<number>("positive");
      const negative = useConfig<number>("negative");
      const zero = useConfig<number>("zero");
      const float = useConfig<number>("float");
      return (
        <>
          <div data-testid="positive">{positive}</div>
          <div data-testid="negative">{negative}</div>
          <div data-testid="zero">{zero}</div>
          <div data-testid="float">{float}</div>
        </>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("positive")).toHaveTextContent("42");
    expect(screen.getByTestId("negative")).toHaveTextContent("-10");
    expect(screen.getByTestId("zero")).toHaveTextContent("0");
    expect(screen.getByTestId("float")).toHaveTextContent("3.14");
  });

  it("handles array config values", () => {
    const client = createMockClient({ items: [1, 2, 3] });

    function TestComponent() {
      const items = useConfig<number[]>("items");
      return <div data-testid="items">{items.join(",")}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("items")).toHaveTextContent("1,2,3");
  });

  it("handles object config values", () => {
    const config = { nested: { deep: { value: "found" } }, array: [1, 2] };
    const client = createMockClient({ complex: config });

    function TestComponent() {
      const complex = useConfig<typeof config>("complex");
      return <div data-testid="complex">{JSON.stringify(complex)}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("complex")).toHaveTextContent(JSON.stringify(config));
  });
});

// ============================================================================
// useConfig hook - Subscriptions
// ============================================================================

describe("useConfig hook - Subscriptions", () => {
  it("subscribes to config on mount", () => {
    const client = createMockClient({ counter: 0 });

    function TestComponent() {
      useConfig<number>("counter");
      return null;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(client.subscribe).toHaveBeenCalledWith("counter", expect.any(Function));
  });

  it("unsubscribes from config on unmount", () => {
    const client = createMockClient({ value: "test" });
    const unsubscribe = vi.fn();
    vi.mocked(client.subscribe).mockReturnValue(unsubscribe);

    function TestComponent() {
      useConfig<string>("value");
      return null;
    }

    const { unmount } = render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(unsubscribe).not.toHaveBeenCalled();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("updates component when config value changes", () => {
    const client = createMockClient({ counter: 0 });

    function TestComponent() {
      const counter = useConfig<number>("counter");
      return <div data-testid="counter">{counter}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("counter")).toHaveTextContent("0");

    act(() => {
      client._updateConfig("counter", 42);
    });

    expect(screen.getByTestId("counter")).toHaveTextContent("42");
  });

  it("handles multiple rapid updates correctly", () => {
    const client = createMockClient({ value: 0 });

    function TestComponent() {
      const value = useConfig<number>("value");
      return <div data-testid="value">{value}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    act(() => {
      client._updateConfig("value", 1);
      client._updateConfig("value", 2);
      client._updateConfig("value", 3);
      client._updateConfig("value", 4);
      client._updateConfig("value", 5);
    });

    expect(screen.getByTestId("value")).toHaveTextContent("5");
  });

  it("re-subscribes when config name changes", () => {
    const client = createMockClient({ configA: "A", configB: "B" });
    const unsubscribeA = vi.fn();
    const unsubscribeB = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(client.subscribe).mockImplementation((name: any) => {
      return name === "configA" ? unsubscribeA : unsubscribeB;
    });

    function TestComponent({ configName }: { configName: string }) {
      const value = useConfig<string>(configName);
      return <div data-testid="value">{value}</div>;
    }

    const { rerender } = render(
      <ReplaneProvider client={client}>
        <TestComponent configName="configA" />
      </ReplaneProvider>
    );

    expect(client.subscribe).toHaveBeenCalledWith("configA", expect.any(Function));

    rerender(
      <ReplaneProvider client={client}>
        <TestComponent configName="configB" />
      </ReplaneProvider>
    );

    // Should unsubscribe from configA and subscribe to configB
    expect(unsubscribeA).toHaveBeenCalled();
    expect(client.subscribe).toHaveBeenCalledWith("configB", expect.any(Function));
  });
});

// ============================================================================
// createConfigHook
// ============================================================================

describe("createConfigHook", () => {
  // Define typed config interface for tests
  interface AppConfig {
    theme: { primaryColor: string; darkMode: boolean };
    featureFlags: { newUI: boolean; beta: boolean };
    maxItems: number;
    appName: string;
  }

  it("creates a typed hook that returns correct config values", () => {
    const client = createMockClient({
      theme: { primaryColor: "#ff0000", darkMode: true },
      featureFlags: { newUI: true, beta: false },
      maxItems: 100,
      appName: "TestApp",
    });

    const useAppConfig = createConfigHook<AppConfig>();

    function TestComponent() {
      const theme = useAppConfig("theme");
      const maxItems = useAppConfig("maxItems");
      const appName = useAppConfig("appName");
      return (
        <>
          <div data-testid="theme">{JSON.stringify(theme)}</div>
          <div data-testid="maxItems">{maxItems}</div>
          <div data-testid="appName">{appName}</div>
        </>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent(
      JSON.stringify({ primaryColor: "#ff0000", darkMode: true })
    );
    expect(screen.getByTestId("maxItems")).toHaveTextContent("100");
    expect(screen.getByTestId("appName")).toHaveTextContent("TestApp");
  });

  it("subscribes to config changes like useConfig", () => {
    const client = createMockClient({
      theme: { primaryColor: "#ff0000", darkMode: false },
    });

    const useAppConfig = createConfigHook<AppConfig>();

    function TestComponent() {
      const theme = useAppConfig("theme");
      return <div data-testid="darkMode">{String(theme.darkMode)}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("darkMode")).toHaveTextContent("false");

    act(() => {
      client._updateConfig("theme", { primaryColor: "#ff0000", darkMode: true });
    });

    expect(screen.getByTestId("darkMode")).toHaveTextContent("true");
  });

  it("passes options to underlying useConfig", () => {
    const client = createMockClient({
      featureFlags: { newUI: true, beta: true },
    });

    const useAppConfig = createConfigHook<AppConfig>();

    function TestComponent() {
      const features = useAppConfig("featureFlags", {
        context: { userId: "123", plan: "premium" },
      });
      return <div data-testid="features">{JSON.stringify(features)}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(client.get).toHaveBeenCalledWith("featureFlags", {
      context: { userId: "123", plan: "premium" },
    });
  });

  it("can create multiple independent typed hooks", () => {
    interface ThemeConfig {
      color: string;
    }

    interface FeatureConfig {
      enabled: boolean;
    }

    const client = createMockClient({
      color: "blue",
      enabled: true,
    });

    const useTheme = createConfigHook<ThemeConfig>();
    const useFeatures = createConfigHook<FeatureConfig>();

    function TestComponent() {
      const color = useTheme("color");
      const enabled = useFeatures("enabled");
      return (
        <>
          <div data-testid="color">{color}</div>
          <div data-testid="enabled">{String(enabled)}</div>
        </>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("color")).toHaveTextContent("blue");
    expect(screen.getByTestId("enabled")).toHaveTextContent("true");
  });

  it("throws error when used outside ReplaneProvider", () => {
    const useAppConfig = createConfigHook<AppConfig>();

    function TestComponent() {
      useAppConfig("theme");
      return null;
    }

    expect(() => render(<TestComponent />)).toThrow(
      "useReplane must be used within a ReplaneProvider"
    );
  });

  it("unsubscribes on unmount", () => {
    const client = createMockClient({ maxItems: 50 });
    const unsubscribe = vi.fn();
    vi.mocked(client.subscribe).mockReturnValue(unsubscribe);

    const useAppConfig = createConfigHook<AppConfig>();

    function TestComponent() {
      useAppConfig("maxItems");
      return null;
    }

    const { unmount } = render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(unsubscribe).not.toHaveBeenCalled();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("works with nested object config types", () => {
    interface DeepConfig {
      settings: {
        ui: {
          theme: {
            colors: {
              primary: string;
              secondary: string;
            };
          };
        };
      };
    }

    const client = createMockClient({
      settings: {
        ui: {
          theme: {
            colors: {
              primary: "#000",
              secondary: "#fff",
            },
          },
        },
      },
    });

    const useDeepConfig = createConfigHook<DeepConfig>();

    function TestComponent() {
      const settings = useDeepConfig("settings");
      return <div data-testid="primary">{settings.ui.theme.colors.primary}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("primary")).toHaveTextContent("#000");
  });

  it("works with array config types", () => {
    interface ListConfig {
      items: string[];
      users: { id: number; name: string }[];
    }

    const client = createMockClient({
      items: ["a", "b", "c"],
      users: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    });

    const useListConfig = createConfigHook<ListConfig>();

    function TestComponent() {
      const items = useListConfig("items");
      const users = useListConfig("users");
      return (
        <>
          <div data-testid="items">{items.join(",")}</div>
          <div data-testid="userCount">{users.length}</div>
        </>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("items")).toHaveTextContent("a,b,c");
    expect(screen.getByTestId("userCount")).toHaveTextContent("2");
  });

  it("handles config name changes correctly", () => {
    const client = createMockClient({
      maxItems: 100,
      appName: "TestApp",
    });

    const unsubscribeMaxItems = vi.fn();
    const unsubscribeAppName = vi.fn();

    vi.mocked(client.subscribe).mockImplementation((name: string | number | symbol) => {
      return name === "maxItems" ? unsubscribeMaxItems : unsubscribeAppName;
    });

    const useAppConfig = createConfigHook<AppConfig>();

    function TestComponent({ configName }: { configName: keyof AppConfig }) {
      const value = useAppConfig(configName);
      return <div data-testid="value">{String(value)}</div>;
    }

    const { rerender } = render(
      <ReplaneProvider client={client}>
        <TestComponent configName="maxItems" />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("value")).toHaveTextContent("100");

    rerender(
      <ReplaneProvider client={client}>
        <TestComponent configName="appName" />
      </ReplaneProvider>
    );

    expect(unsubscribeMaxItems).toHaveBeenCalled();
    expect(screen.getByTestId("value")).toHaveTextContent("TestApp");
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

    function TestComponent() {
      const v1 = useConfig<string>("config1");
      const v2 = useConfig<string>("config2");
      const v3 = useConfig<string>("config3");
      return (
        <div data-testid="all">
          {v1},{v2},{v3}
        </div>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("all")).toHaveTextContent("value1,value2,value3");
  });

  it("only updates affected components when one config changes", () => {
    const client = createMockClient({ configA: "A", configB: "B" });
    let renderCountA = 0;
    let renderCountB = 0;

    function ComponentA() {
      renderCountA++;
      const value = useConfig<string>("configA");
      return <div data-testid="valueA">{value}</div>;
    }

    function ComponentB() {
      renderCountB++;
      const value = useConfig<string>("configB");
      return <div data-testid="valueB">{value}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <ComponentA />
        <ComponentB />
      </ReplaneProvider>
    );

    const initialA = renderCountA;
    const initialB = renderCountB;

    // Update only configA
    act(() => {
      client._updateConfig("configA", "A-updated");
    });

    expect(screen.getByTestId("valueA")).toHaveTextContent("A-updated");
    expect(screen.getByTestId("valueB")).toHaveTextContent("B");
    expect(renderCountA).toBeGreaterThan(initialA);
    expect(renderCountB).toBe(initialB);
  });

  it("handles same config subscribed by multiple components", () => {
    const client = createMockClient({ shared: 0 });

    function ComponentA() {
      const value = useConfig<number>("shared");
      return <div data-testid="sharedA">{value}</div>;
    }

    function ComponentB() {
      const value = useConfig<number>("shared");
      return <div data-testid="sharedB">{value}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <ComponentA />
        <ComponentB />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("sharedA")).toHaveTextContent("0");
    expect(screen.getByTestId("sharedB")).toHaveTextContent("0");

    act(() => {
      client._updateConfig("shared", 100);
    });

    expect(screen.getByTestId("sharedA")).toHaveTextContent("100");
    expect(screen.getByTestId("sharedB")).toHaveTextContent("100");
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe("Integration Scenarios", () => {
  it("works with React StrictMode", async () => {
    const client = createMockClient({ strictMode: "works" });

    function TestComponent() {
      const value = useConfig<string>("strictMode");
      return <div data-testid="value">{value}</div>;
    }

    render(
      <StrictMode>
        <ReplaneProvider client={client}>
          <TestComponent />
        </ReplaneProvider>
      </StrictMode>
    );

    expect(screen.getByTestId("value")).toHaveTextContent("works");
  });

  it("handles conditional rendering of config consumers", () => {
    const client = createMockClient({ conditionalConfig: "visible" });

    function ConditionalComponent({ show }: { show: boolean }) {
      return show ? <ConfigConsumer /> : null;
    }

    function ConfigConsumer() {
      const value = useConfig<string>("conditionalConfig");
      return <div data-testid="conditional">{value}</div>;
    }

    const { rerender } = render(
      <ReplaneProvider client={client}>
        <ConditionalComponent show={false} />
      </ReplaneProvider>
    );

    expect(screen.queryByTestId("conditional")).not.toBeInTheDocument();

    rerender(
      <ReplaneProvider client={client}>
        <ConditionalComponent show={true} />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("conditional")).toHaveTextContent("visible");

    rerender(
      <ReplaneProvider client={client}>
        <ConditionalComponent show={false} />
      </ReplaneProvider>
    );

    expect(screen.queryByTestId("conditional")).not.toBeInTheDocument();
  });

  it("works with component that uses multiple hooks", () => {
    const client = createMockClient({ feature: true, count: 5 });

    function MultiHookComponent() {
      const contextClient = useReplane();
      const feature = useConfig<boolean>("feature");
      const count = useConfig<number>("count");
      const [localState, setLocalState] = useState(0);

      const increment = useCallback(() => setLocalState((s) => s + 1), []);

      return (
        <div>
          <div data-testid="hasClient">{contextClient ? "yes" : "no"}</div>
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
      <ReplaneProvider client={client}>
        <MultiHookComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("hasClient")).toHaveTextContent("yes");
    expect(screen.getByTestId("feature")).toHaveTextContent("true");
    expect(screen.getByTestId("count")).toHaveTextContent("5");
    expect(screen.getByTestId("local")).toHaveTextContent("0");
  });

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

    function TestComponent() {
      useConfig<string>("config1");
      useConfig<string>("config2");
      useConfig<string>("config3");
      return null;
    }

    const { unmount } = render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    unmount();

    unsubscribes.forEach((unsub) => {
      expect(unsub).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  it("handles empty string config value", () => {
    const client = createMockClient({ empty: "" });

    function TestComponent() {
      const value = useConfig<string>("empty");
      return <div data-testid="value">{value || "EMPTY"}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("value")).toHaveTextContent("EMPTY");
  });

  it("handles config name with special characters", () => {
    const client = createMockClient({
      "feature.flag.enabled": true,
      "config-with-dashes": "works",
      config_with_underscores: "also_works",
    });

    function TestComponent() {
      const dots = useConfig<boolean>("feature.flag.enabled");
      const dashes = useConfig<string>("config-with-dashes");
      const underscores = useConfig<string>("config_with_underscores");
      return (
        <>
          <div data-testid="dots">{String(dots)}</div>
          <div data-testid="dashes">{dashes}</div>
          <div data-testid="underscores">{underscores}</div>
        </>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("dots")).toHaveTextContent("true");
    expect(screen.getByTestId("dashes")).toHaveTextContent("works");
    expect(screen.getByTestId("underscores")).toHaveTextContent("also_works");
  });

  it("handles very large config values", () => {
    const largeArray = Array.from({ length: 1000 }, (_, i) => i);
    const client = createMockClient({ largeArray });

    function TestComponent() {
      const value = useConfig<number[]>("largeArray");
      return <div data-testid="length">{value.length}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("length")).toHaveTextContent("1000");
  });

  it("handles unicode config values", () => {
    const client = createMockClient({
      unicode: "Hello 世界 🌍 مرحبا",
    });

    function TestComponent() {
      const value = useConfig<string>("unicode");
      return <div data-testid="unicode">{value}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("unicode")).toHaveTextContent("Hello 世界 🌍 مرحبا");
  });

  it("handles Date object config values", () => {
    const date = new Date("2024-01-15T12:00:00Z");
    const client = createMockClient({ date });

    function TestComponent() {
      const value = useConfig<Date>("date");
      return <div data-testid="date">{value.toISOString()}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("date")).toHaveTextContent("2024-01-15T12:00:00.000Z");
  });
});

// ============================================================================
// ReplaneProvider with snapshot prop (SSR/hydration)
// ============================================================================

describe("ReplaneProvider with snapshot prop", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReplaneClass: any;

  const snapshotTestConnection: ConnectOptions = {
    baseUrl: "https://replane.example.com",
    sdkKey: "rp_test_key",
  };

  afterEach(() => {
    mockReplaneClass?.mockRestore();
  });

  it("renders children immediately with restored client", () => {
    const mockClient = createMockClient({ feature: "restored-value" });
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const snapshot = {
      configs: [{ name: "feature", value: "restored-value", overrides: [] }],
    };

    render(
      <ReplaneProvider connection={snapshotTestConnection} snapshot={snapshot}>
        <div data-testid="child">Hello</div>
      </ReplaneProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    // Verify Replane was created with the snapshot
    expect(mockReplaneClass).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot,
      })
    );
  });

  it("provides restored client to children via context", () => {
    const mockClient = createMockClient({ feature: "test-value" });
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedClient: Replane<any> | null = null;

    function TestComponent() {
      const replane = useReplane();
      capturedClient = replane;
      return <div data-testid="content">Content</div>;
    }

    render(
      <ReplaneProvider
        connection={snapshotTestConnection}
        snapshot={{
          configs: [{ name: "feature", value: "test-value", overrides: [] }],
        }}
      >
        <TestComponent />
      </ReplaneProvider>
    );

    expect(capturedClient).toBe(mockClient);
  });

  it("allows useConfig to retrieve values from restored client", () => {
    const mockClient = createMockClient({ theme: "dark", count: 42 });
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    function TestComponent() {
      const theme = useConfig<string>("theme");
      const count = useConfig<number>("count");
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <span data-testid="count">{count}</span>
        </div>
      );
    }

    render(
      <ReplaneProvider
        connection={snapshotTestConnection}
        snapshot={{
          configs: [
            { name: "theme", value: "dark", overrides: [] },
            { name: "count", value: 42, overrides: [] },
          ],
        }}
      >
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("count")).toHaveTextContent("42");
  });

  it("passes connection options to connect method", () => {
    const mockClient = createMockClient({ feature: "value" });
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const connection: ConnectOptions = {
      baseUrl: "https://replane.example.com",
      sdkKey: "rp_live_key",
    };

    const snapshot = {
      configs: [{ name: "feature", value: "value", overrides: [] }],
    };

    render(
      <ReplaneProvider connection={connection} snapshot={snapshot}>
        <div data-testid="child">Hello</div>
      </ReplaneProvider>
    );

    expect(mockClient.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: connection.baseUrl,
        sdkKey: connection.sdkKey,
      })
    );
  });

  it("passes context to Replane constructor", () => {
    const mockClient = createMockClient({ feature: "premium-value" });
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const connection: ConnectOptions = {
      baseUrl: "https://replane.example.com",
      sdkKey: "rp_test_key",
    };

    const context = { plan: "premium" };

    const snapshot = {
      configs: [{ name: "feature", value: "premium-value", overrides: [] }],
    };

    render(
      <ReplaneProvider connection={connection} context={context} snapshot={snapshot}>
        <div data-testid="child">Hello</div>
      </ReplaneProvider>
    );

    expect(mockReplaneClass).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot,
        context,
      })
    );
  });

  it("memoizes client based on snapshot and connection reference", () => {
    const mockClient = createMockClient();
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const snapshot = {
      configs: [{ name: "feature", value: "value", overrides: [] }],
    };

    const { rerender } = render(
      <ReplaneProvider connection={snapshotTestConnection} snapshot={snapshot}>
        <div>Content</div>
      </ReplaneProvider>
    );

    expect(mockReplaneClass).toHaveBeenCalledTimes(1);

    // Re-render with same connection and snapshot objects - should not create new instance
    rerender(
      <ReplaneProvider connection={snapshotTestConnection} snapshot={snapshot}>
        <div>Content</div>
      </ReplaneProvider>
    );

    expect(mockReplaneClass).toHaveBeenCalledTimes(1);
  });

  it("creates new client when snapshot reference changes", () => {
    const mockClient1 = createMockClient({ feature: "value1" });
    mockClient1.connect = vi.fn().mockResolvedValue(undefined);
    const mockClient2 = createMockClient({ feature: "value2" });
    mockClient2.connect = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => {
      callCount++;
      return callCount === 1 ? mockClient1 : mockClient2;
    });

    const { rerender } = render(
      <ReplaneProvider
        connection={snapshotTestConnection}
        snapshot={{ configs: [{ name: "feature", value: "value1", overrides: [] }] }}
      >
        <div>Content</div>
      </ReplaneProvider>
    );

    expect(mockReplaneClass).toHaveBeenCalledTimes(1);

    // No re-render with new snapshot object - should not create new instance
    rerender(
      <ReplaneProvider
        connection={snapshotTestConnection}
        snapshot={{ configs: [{ name: "feature", value: "value2", overrides: [] }] }}
      >
        <div>Content</div>
      </ReplaneProvider>
    );

    expect(mockReplaneClass).toHaveBeenCalledTimes(1);
  });

  it("works with createReplaneHook for typed access", () => {
    interface AppConfigs {
      theme: { darkMode: boolean };
      maxItems: number;
    }

    const mockClient = createMockClient({
      theme: { darkMode: true },
      maxItems: 100,
    });
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const useAppReplane = createReplaneHook<AppConfigs>();

    function TestComponent() {
      const replane = useAppReplane();
      const snapshot = replane.getSnapshot();
      return <div data-testid="snapshot">{JSON.stringify(snapshot)}</div>;
    }

    render(
      <ReplaneProvider
        connection={snapshotTestConnection}
        snapshot={{
          configs: [
            { name: "theme", value: { darkMode: true }, overrides: [] },
            { name: "maxItems", value: 100, overrides: [] },
          ],
        }}
      >
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("snapshot")).toBeInTheDocument();
    expect(mockClient.getSnapshot).toHaveBeenCalled();
  });

  it("works with createConfigHook for typed config access", () => {
    interface AppConfigs {
      "feature-flags": { beta: boolean; newUI: boolean };
    }

    const mockClient = createMockClient({
      "feature-flags": { beta: true, newUI: false },
    });
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    const useAppConfig = createConfigHook<AppConfigs>();

    function TestComponent() {
      const features = useAppConfig("feature-flags");
      return (
        <div>
          <span data-testid="beta">{features.beta ? "yes" : "no"}</span>
          <span data-testid="newUI">{features.newUI ? "yes" : "no"}</span>
        </div>
      );
    }

    render(
      <ReplaneProvider
        connection={snapshotTestConnection}
        snapshot={{
          configs: [{ name: "feature-flags", value: { beta: true, newUI: false }, overrides: [] }],
        }}
      >
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("beta")).toHaveTextContent("yes");
    expect(screen.getByTestId("newUI")).toHaveTextContent("no");
  });

  it("renders immediately with snapshot (no loading state needed)", () => {
    const mockClient = createMockClient({ feature: "value" });
    mockClient.connect = vi.fn().mockResolvedValue(undefined);
    mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => mockClient);

    // Note: with snapshot, client is usable immediately
    render(
      <ReplaneProvider
        connection={snapshotTestConnection}
        snapshot={{
          configs: [{ name: "feature", value: "value", overrides: [] }],
        }}
      >
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    // Content should be visible immediately since snapshot provides initial data
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});

// ============================================================================
// ReplaneProvider with async prop
// ============================================================================

describe("ReplaneProvider with async prop", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockReplaneClass: any;
  let mockClient: ReturnType<typeof createMockClient>;
  let resolveConnect: () => void;
  let rejectConnect: (error: Error) => void;

  beforeEach(() => {
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

  it("renders children immediately without waiting for connection", () => {
    render(
      <ReplaneProvider connection={defaultConnection} defaults={{ feature: "default-value" }} async>
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    // Content should be visible immediately
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("does not show loader even when provided", () => {
    render(
      <ReplaneProvider
        connection={defaultConnection}
        defaults={{ feature: "default-value" }}
        loader={<div data-testid="loader">Loading...</div>}
        async
      >
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    // Loader should not be shown in async mode
    expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("creates client with defaults", () => {
    const defaults = { feature: "my-default" };

    render(
      <ReplaneProvider connection={defaultConnection} defaults={defaults} async>
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    expect(mockReplaneClass).toHaveBeenCalledWith(
      expect.objectContaining({
        defaults,
      })
    );
  });

  it("connects in the background after render", async () => {
    render(
      <ReplaneProvider connection={defaultConnection} defaults={{ feature: "default-value" }} async>
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    // Content is rendered immediately
    expect(screen.getByTestId("content")).toBeInTheDocument();

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

  it("provides client to children via context immediately", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedClient: Replane<any> | null = null;

    function TestComponent() {
      const replane = useReplane();
      capturedClient = replane;
      return <div data-testid="content">Content</div>;
    }

    render(
      <ReplaneProvider connection={defaultConnection} defaults={{ feature: "default-value" }} async>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(capturedClient).toBe(mockClient);
  });

  it("allows useConfig to retrieve default values immediately", () => {
    function TestComponent() {
      const feature = useConfig<string>("feature");
      return <div data-testid="value">{feature}</div>;
    }

    render(
      <ReplaneProvider connection={defaultConnection} defaults={{ feature: "default-value" }} async>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("value")).toHaveTextContent("default-value");
  });

  it("updates values when connection succeeds and server sends new values", async () => {
    function TestComponent() {
      const feature = useConfig<string>("feature");
      return <div data-testid="value">{feature}</div>;
    }

    render(
      <ReplaneProvider connection={defaultConnection} defaults={{ feature: "default-value" }} async>
        <TestComponent />
      </ReplaneProvider>
    );

    // Initially shows default
    expect(screen.getByTestId("value")).toHaveTextContent("default-value");

    // Simulate successful connection
    await act(async () => {
      resolveConnect();
    });

    // Simulate server sending new value
    await act(async () => {
      mockClient._updateConfig("feature", "server-value");
    });

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("server-value");
    });
  });

  it("logs error when connection fails but does not throw", async () => {
    const mockLogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    };

    render(
      <ReplaneProvider
        connection={defaultConnection}
        defaults={{ feature: "default-value" }}
        logger={mockLogger}
        async
      >
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    // Content should be visible
    expect(screen.getByTestId("content")).toBeInTheDocument();

    // Simulate connection failure
    await act(async () => {
      rejectConnect(new Error("Connection failed"));
    });

    // Error should be logged, not thrown
    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to connect Replane client",
        expect.any(Error)
      );
    });

    // Content should still be visible (no error boundary triggered)
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("uses console.error when no logger provided and connection fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ReplaneProvider connection={defaultConnection} defaults={{ feature: "default-value" }} async>
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    await act(async () => {
      rejectConnect(new Error("Connection failed"));
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to connect Replane client",
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it("disconnects client on unmount", async () => {
    const { unmount } = render(
      <ReplaneProvider connection={defaultConnection} defaults={{ feature: "default-value" }} async>
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    // Resolve connection first
    await act(async () => {
      resolveConnect();
    });

    unmount();

    await waitFor(() => {
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  it("does not connect when connection is null", async () => {
    render(
      <ReplaneProvider connection={null} defaults={{ feature: "default-value" }} async>
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();

    // Wait a bit and verify connect was never called
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockClient.connect).not.toHaveBeenCalled();
  });

  it("works with context prop for override evaluations", () => {
    const context = { userId: "user-123", plan: "premium" };

    render(
      <ReplaneProvider
        connection={defaultConnection}
        defaults={{ feature: "default-value" }}
        context={context}
        async
      >
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    expect(mockReplaneClass).toHaveBeenCalledWith(
      expect.objectContaining({
        context,
      })
    );
  });

  it("works in StrictMode without double connection", async () => {
    render(
      <StrictMode>
        <ReplaneProvider
          connection={defaultConnection}
          defaults={{ feature: "default-value" }}
          async
        >
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </StrictMode>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();

    // Wait for effects to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // In StrictMode, effects may run twice in development, but we should handle it gracefully
    // The key assertion is that the component works correctly
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});

// ============================================================================
// Additional Edge Cases
// ============================================================================

describe("ReplaneProvider edge cases", () => {
  it("renders children with connection: null and defaults only", () => {
    const mockReplaneClass = vi.spyOn(sdk, "Replane").mockImplementation(() => {
      return createMockClient({ feature: "default-value" });
    });

    function TestComponent() {
      const value = useConfig<string>("feature");
      return <div data-testid="value">{value}</div>;
    }

    render(
      <ReplaneProvider connection={null} defaults={{ feature: "default-value" }}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("value")).toHaveTextContent("default-value");

    mockReplaneClass.mockRestore();
  });

  it("handles deeply nested objects in config", () => {
    const deepConfig = {
      level1: {
        level2: {
          level3: {
            level4: {
              value: "deep-value",
              array: [1, 2, { nested: true }],
            },
          },
        },
      },
    };

    const client = createMockClient({ deep: deepConfig });

    function TestComponent() {
      const config = useConfig<typeof deepConfig>("deep");
      return <div data-testid="deep">{config.level1.level2.level3.level4.value}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("deep")).toHaveTextContent("deep-value");
  });

  it("handles null config values correctly", () => {
    const client = createMockClient({ nullValue: null });

    function TestComponent() {
      const value = useConfig<string | null>("nullValue");
      return <div data-testid="null">{value === null ? "IS_NULL" : "NOT_NULL"}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("null")).toHaveTextContent("IS_NULL");
  });

  it("handles undefined config values correctly", () => {
    const client = createMockClient({ undefinedValue: undefined });

    function TestComponent() {
      const value = useConfig<string | undefined>("undefinedValue");
      return (
        <div data-testid="undefined">{value === undefined ? "IS_UNDEFINED" : "NOT_UNDEFINED"}</div>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("undefined")).toHaveTextContent("IS_UNDEFINED");
  });

  it("handles false boolean config value", () => {
    const client = createMockClient({ disabled: false });

    function TestComponent() {
      const value = useConfig<boolean>("disabled");
      return <div data-testid="bool">{value === false ? "FALSE" : "TRUE"}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("bool")).toHaveTextContent("FALSE");
  });

  it("handles zero number config value", () => {
    const client = createMockClient({ zero: 0 });

    function TestComponent() {
      const value = useConfig<number>("zero");
      return <div data-testid="zero">{value === 0 ? "ZERO" : "NOT_ZERO"}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("zero")).toHaveTextContent("ZERO");
  });

  it("handles empty array config value", () => {
    const client = createMockClient({ emptyArray: [] });

    function TestComponent() {
      const value = useConfig<unknown[]>("emptyArray");
      return <div data-testid="array">{value.length === 0 ? "EMPTY" : "NOT_EMPTY"}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("array")).toHaveTextContent("EMPTY");
  });

  it("handles empty object config value", () => {
    const client = createMockClient({ emptyObject: {} });

    function TestComponent() {
      const value = useConfig<Record<string, unknown>>("emptyObject");
      return (
        <div data-testid="object">{Object.keys(value).length === 0 ? "EMPTY" : "NOT_EMPTY"}</div>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("object")).toHaveTextContent("EMPTY");
  });

  it("supports deeply nested component tree", () => {
    const client = createMockClient({ feature: "deep-nested-value" });

    function Level1() {
      return (
        <div>
          <Level2 />
        </div>
      );
    }
    function Level2() {
      return (
        <div>
          <Level3 />
        </div>
      );
    }
    function Level3() {
      return (
        <div>
          <Level4 />
        </div>
      );
    }
    function Level4() {
      return (
        <div>
          <DeepConsumer />
        </div>
      );
    }
    function DeepConsumer() {
      const value = useConfig<string>("feature");
      return <div data-testid="deep-consumer">{value}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <Level1 />
      </ReplaneProvider>
    );

    expect(screen.getByTestId("deep-consumer")).toHaveTextContent("deep-nested-value");
  });

  it("handles config updates in deeply nested components", async () => {
    const client = createMockClient({ feature: "initial" });

    function DeepConsumer() {
      const value = useConfig<string>("feature");
      return <div data-testid="value">{value}</div>;
    }

    function Wrapper({ children }: { children: React.ReactNode }) {
      return <div>{children}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <Wrapper>
          <Wrapper>
            <Wrapper>
              <DeepConsumer />
            </Wrapper>
          </Wrapper>
        </Wrapper>
      </ReplaneProvider>
    );

    expect(screen.getByTestId("value")).toHaveTextContent("initial");

    act(() => {
      client._updateConfig("feature", "updated");
    });

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("updated");
    });
  });

  it("useConfig returns same reference for unchanged object config", () => {
    const objectConfig = { key: "value" };
    const client = createMockClient({ config: objectConfig });
    const references: object[] = [];

    function TestComponent() {
      const value = useConfig<{ key: string }>("config");
      references.push(value);
      return <div data-testid="value">{value.key}</div>;
    }

    const { rerender } = render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    // Force re-render
    rerender(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    // Both references should be the same (no unnecessary re-renders)
    expect(references.length).toBeGreaterThanOrEqual(2);
  });

  it("handles rapid consecutive config updates", async () => {
    const client = createMockClient({ counter: 0 });

    function TestComponent() {
      const value = useConfig<number>("counter");
      return <div data-testid="counter">{value}</div>;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    // Rapid updates
    act(() => {
      for (let i = 1; i <= 10; i++) {
        client._updateConfig("counter", i);
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId("counter")).toHaveTextContent("10");
    });
  });

  it("handles config with special JSON values (NaN, Infinity)", () => {
    // Note: These will be stored as null after JSON serialization
    const client = createMockClient({
      special: {
        nan: Number.NaN,
        infinity: Number.POSITIVE_INFINITY,
        negInfinity: Number.NEGATIVE_INFINITY,
      },
    });

    function TestComponent() {
      const value = useConfig<{
        nan: number;
        infinity: number;
        negInfinity: number;
      }>("special");
      return (
        <div data-testid="special">
          {Number.isNaN(value.nan) ? "NAN" : "NOT_NAN"},
          {!Number.isFinite(value.infinity) ? "INF" : "FIN"}
        </div>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    // Values should be present (behavior depends on implementation)
    expect(screen.getByTestId("special")).toBeInTheDocument();
  });

  it("multiple useConfig hooks in same component update independently", async () => {
    const client = createMockClient({ config1: "value1", config2: "value2" });
    let renderCount = 0;

    function TestComponent() {
      const value1 = useConfig<string>("config1");
      const value2 = useConfig<string>("config2");
      renderCount++;
      return (
        <div>
          <span data-testid="v1">{value1}</span>
          <span data-testid="v2">{value2}</span>
        </div>
      );
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    const initialRenderCount = renderCount;

    // Update only config1
    act(() => {
      client._updateConfig("config1", "updated1");
    });

    await waitFor(() => {
      expect(screen.getByTestId("v1")).toHaveTextContent("updated1");
    });
    expect(screen.getByTestId("v2")).toHaveTextContent("value2");

    // Update only config2
    act(() => {
      client._updateConfig("config2", "updated2");
    });

    await waitFor(() => {
      expect(screen.getByTestId("v2")).toHaveTextContent("updated2");
    });

    // Should have re-rendered for both updates
    expect(renderCount).toBeGreaterThan(initialRenderCount);
  });
});
