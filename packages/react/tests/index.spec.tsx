import { Suspense, Component, useState, useCallback, StrictMode } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
  ReplaneProvider,
  useReplane,
  useConfig,
  clearSuspenseCache,
} from "../src/index";
import type { ReplaneClient, ReplaneClientOptions } from "@replanejs/sdk";
import * as sdk from "@replanejs/sdk";

// ============================================================================
// Test Utilities
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockClient(configs: Record<string, unknown> = {}): ReplaneClient<any> & {
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
    _triggerGlobalUpdate: () => {
      globalSubscribers.forEach((cb) => cb());
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as ReplaneClient<any> & {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defaultTestOptions: ReplaneClientOptions<any> = {
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
    let capturedClient: ReplaneClient<any> | null = null;

    function TestComponent() {
      const { client: contextClient } = useReplane();
      capturedClient = contextClient;
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
    let capturedClient: ReplaneClient<any> | null = null;

    function TestComponent() {
      const { client } = useReplane();
      capturedClient = client;
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

  it("does not call client.close on unmount when client is passed as prop", () => {
    const client = createMockClient();

    const { unmount } = render(
      <ReplaneProvider client={client}>
        <div>Content</div>
      </ReplaneProvider>
    );

    unmount();

    // Client should NOT be closed when passed as prop (user manages lifecycle)
    expect(client.close).not.toHaveBeenCalled();
  });
});

// ============================================================================
// ReplaneProvider with options prop - Loading States
// ============================================================================

describe("ReplaneProvider with options prop - Loading States", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCreateClient: any;
  let mockClient: ReturnType<typeof createMockClient>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resolveClient: (client: ReplaneClient<any>) => void;
  let rejectClient: (error: Error) => void;

  beforeEach(() => {
    mockClient = createMockClient({ feature: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientPromise = new Promise<ReplaneClient<any>>((resolve, reject) => {
      resolveClient = resolve;
      rejectClient = reject;
    });

    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockReturnValue(clientPromise);

    clearSuspenseCache();
  });

  afterEach(() => {
    mockCreateClient.mockRestore();
    clearSuspenseCache();
  });

  it("shows loader component while initializing", () => {
    render(
      <ReplaneProvider
        options={defaultTestOptions}
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
        options={defaultTestOptions}
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
      <ReplaneProvider options={defaultTestOptions}>
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });

  it("transitions from loader to content after initialization", async () => {
    render(
      <ReplaneProvider
        options={defaultTestOptions}
        loader={<div data-testid="loader">Loading...</div>}
      >
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();

    await act(async () => {
      resolveClient(mockClient);
    });

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
  });

  it("shows loader on error (does not render children)", async () => {
    const onError = vi.fn();

    render(
      <ReplaneProvider
        options={defaultTestOptions}
        onError={onError}
        loader={<div data-testid="loader">Loading...</div>}
      >
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    await act(async () => {
      rejectClient(new Error("Connection failed"));
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });

    // Should show loader, not content
    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });
});

// ============================================================================
// ReplaneProvider with options prop - Client Lifecycle
// ============================================================================

describe("ReplaneProvider with options prop - Client Lifecycle", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCreateClient: any;

  beforeEach(() => {
    clearSuspenseCache();
  });

  afterEach(() => {
    mockCreateClient?.mockRestore();
    clearSuspenseCache();
  });

  it("calls createReplaneClient with correct options", async () => {
    const mockClient = createMockClient();
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    render(
      <ReplaneProvider options={defaultTestOptions}>
        <div>Content</div>
      </ReplaneProvider>
    );

    await waitFor(() => {
      expect(mockCreateClient).toHaveBeenCalledWith(defaultTestOptions);
    });
  });

  it("provides initialized client to children via context", async () => {
    const mockClient = createMockClient({ test: "value" });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedClient: ReplaneClient<any> | null = null;

    function TestComponent() {
      const { client } = useReplane();
      capturedClient = client;
      return <div data-testid="content">Content</div>;
    }

    render(
      <ReplaneProvider options={defaultTestOptions}>
        <TestComponent />
      </ReplaneProvider>
    );

    await waitFor(() => {
      expect(capturedClient).toBe(mockClient);
    });
  });

  it("closes client on unmount after successful initialization", async () => {
    const mockClient = createMockClient();
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const { unmount } = render(
      <ReplaneProvider options={defaultTestOptions}>
        <div>Content</div>
      </ReplaneProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText("Content")).toBeInTheDocument();
    });

    unmount();

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });

  it("handles unmount during initialization gracefully", async () => {
    const mockClient = createMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveClient: (client: ReplaneClient<any>) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientPromise = new Promise<ReplaneClient<any>>((resolve) => {
      resolveClient = resolve;
    });

    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockReturnValue(clientPromise);

    const { unmount } = render(
      <ReplaneProvider
        options={defaultTestOptions}
        loader={<div data-testid="loader">Loading</div>}
      >
        <div>Content</div>
      </ReplaneProvider>
    );

    // Unmount while still loading
    unmount();

    // Resolve after unmount - should close the client
    await act(async () => {
      resolveClient!(mockClient);
    });

    // Client should be closed because component unmounted
    expect(mockClient.close).toHaveBeenCalled();
  });

  it("does not call createReplaneClient multiple times on re-render", async () => {
    const mockClient = createMockClient();
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    const { rerender } = render(
      <ReplaneProvider options={defaultTestOptions}>
        <div>Content</div>
      </ReplaneProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText("Content")).toBeInTheDocument();
    });

    rerender(
      <ReplaneProvider options={defaultTestOptions}>
        <div>Updated</div>
      </ReplaneProvider>
    );

    rerender(
      <ReplaneProvider options={defaultTestOptions}>
        <div>Updated Again</div>
      </ReplaneProvider>
    );

    // Should only call createReplaneClient once
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// ReplaneProvider with options prop - Error Handling
// ============================================================================

describe("ReplaneProvider with options prop - Error Handling", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCreateClient: any;

  beforeEach(() => {
    clearSuspenseCache();
  });

  afterEach(() => {
    mockCreateClient?.mockRestore();
    clearSuspenseCache();
  });

  it("calls onError callback when initialization fails", async () => {
    const error = new Error("Network error");
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue(error);

    const onError = vi.fn();

    render(
      <ReplaneProvider options={defaultTestOptions} onError={onError}>
        <div>Content</div>
      </ReplaneProvider>
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  it("calls onError with wrapped error for non-Error rejections", async () => {
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue("string error");

    const onError = vi.fn();

    render(
      <ReplaneProvider options={defaultTestOptions} onError={onError}>
        <div>Content</div>
      </ReplaneProvider>
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
      const calledError = onError.mock.calls[0][0];
      expect(calledError).toBeInstanceOf(Error);
      expect(calledError.message).toBe("string error");
    });
  });

  it("does not render children after error", async () => {
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue(new Error("Failed"));

    render(
      <ReplaneProvider
        options={defaultTestOptions}
        onError={() => {}}
        loader={<div data-testid="loader">Loading</div>}
      >
        <div data-testid="content">Content</div>
      </ReplaneProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loader")).toBeInTheDocument();
    });

    // Wait a bit more to ensure content never appears
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });
});

// ============================================================================
// ReplaneProvider with Suspense
// ============================================================================

describe("ReplaneProvider with suspense", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCreateClient: any;

  beforeEach(() => {
    clearSuspenseCache();
  });

  afterEach(() => {
    mockCreateClient?.mockRestore();
    clearSuspenseCache();
  });

  it("suspends while client is initializing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveClient: (client: ReplaneClient<any>) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientPromise = new Promise<ReplaneClient<any>>((resolve) => {
      resolveClient = resolve;
    });

    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockReturnValue(clientPromise);

    render(
      <Suspense fallback={<div data-testid="fallback">Suspending...</div>}>
        <ReplaneProvider options={defaultTestOptions} suspense>
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </Suspense>
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();

    const mockClient = createMockClient();
    await act(async () => {
      resolveClient!(mockClient);
    });

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("provides client to children when using suspense", async () => {
    const mockClient = createMockClient({ test: "suspenseValue" });
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedClient: ReplaneClient<any> | null = null;

    function TestComponent() {
      const { client } = useReplane();
      capturedClient = client;
      return <div data-testid="content">Content</div>;
    }

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider options={defaultTestOptions} suspense>
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
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    // First render
    const { unmount } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider options={defaultTestOptions} suspense>
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
        <ReplaneProvider options={defaultTestOptions} suspense>
          <div data-testid="content">Second</div>
        </ReplaneProvider>
      </Suspense>
    );

    // Should NOT show fallback because client is cached
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
    expect(screen.getByTestId("content")).toHaveTextContent("Second");

    // createReplaneClient should only be called once
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });

  it("creates new client for different sdkKey", async () => {
    const mockClient1 = createMockClient();
    const mockClient2 = createMockClient();
    let callCount = 0;

    mockCreateClient = vi.spyOn(sdk, "createReplaneClient").mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? mockClient1 : mockClient2);
    });

    // First render
    const { unmount } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider options={defaultTestOptions} suspense>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const differentOptions: ReplaneClientOptions<any> = {
      baseUrl: "https://test.replane.dev",
      sdkKey: "rp_different_key",
    };

    render(
      <Suspense fallback={<div data-testid="fallback">Loading...</div>}>
        <ReplaneProvider options={differentOptions} suspense>
          <div data-testid="content">Second</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByTestId("content")).toHaveTextContent("Second");
    });

    // Should have called createReplaneClient twice
    expect(mockCreateClient).toHaveBeenCalledTimes(2);
  });

  it("throws to error boundary when initialization fails with suspense", async () => {
    const error = new Error("Suspense init failed");
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockRejectedValue(error);

    const onError = vi.fn();

    render(
      <ErrorBoundary
        fallback={<div data-testid="error-fallback">Error occurred</div>}
        onError={onError}
      >
        <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
          <ReplaneProvider options={defaultTestOptions} suspense>
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
});

// ============================================================================
// clearSuspenseCache
// ============================================================================

describe("clearSuspenseCache", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCreateClient: any;

  beforeEach(() => {
    clearSuspenseCache();
  });

  afterEach(() => {
    mockCreateClient?.mockRestore();
    clearSuspenseCache();
  });

  it("clears all cache entries when called without options", async () => {
    const mockClient = createMockClient();
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    // First render to populate cache
    const { unmount } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider options={defaultTestOptions} suspense>
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });

    unmount();
    expect(mockCreateClient).toHaveBeenCalledTimes(1);

    // Clear cache
    clearSuspenseCache();

    // Second render should create new client
    render(
      <Suspense fallback={<div data-testid="fallback">Loading...</div>}>
        <ReplaneProvider options={defaultTestOptions} suspense>
          <div data-testid="content">Content</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(mockCreateClient).toHaveBeenCalledTimes(2);
    });
  });

  it("clears only specific cache entry when options provided", async () => {
    const mockClient = createMockClient();
    mockCreateClient = vi
      .spyOn(sdk, "createReplaneClient")
      .mockResolvedValue(mockClient);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options1: ReplaneClientOptions<any> = {
      baseUrl: "https://test1.replane.dev",
      sdkKey: "rp_key1",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options2: ReplaneClientOptions<any> = {
      baseUrl: "https://test2.replane.dev",
      sdkKey: "rp_key2",
    };

    // Populate cache with both
    const { unmount: unmount1 } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider options={options1} suspense>
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
        <ReplaneProvider options={options2} suspense>
          <div data-testid="content2">Content2</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByTestId("content2")).toBeInTheDocument();
    });

    unmount2();

    expect(mockCreateClient).toHaveBeenCalledTimes(2);

    // Clear only options1
    clearSuspenseCache(options1);

    // Re-render with options1 should create new client
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <ReplaneProvider options={options1} suspense>
          <div>Content1</div>
        </ReplaneProvider>
      </Suspense>
    );

    await waitFor(() => {
      expect(mockCreateClient).toHaveBeenCalledTimes(3);
    });
  });

  it("is a no-op when clearing non-existent cache entry", () => {
    // Should not throw
    expect(() => clearSuspenseCache(defaultTestOptions)).not.toThrow();
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

  it("returns context object with client property", () => {
    const client = createMockClient();
    let context: ReturnType<typeof useReplane> | null = null;

    function TestComponent() {
      context = useReplane();
      return null;
    }

    render(
      <ReplaneProvider client={client}>
        <TestComponent />
      </ReplaneProvider>
    );

    expect(context).not.toBeNull();
    expect(context).toHaveProperty("client");
    expect(context!.client).toBe(client);
  });

  it("returns same context reference across renders", () => {
    const client = createMockClient();
    const contexts: ReturnType<typeof useReplane>[] = [];

    function TestComponent() {
      const context = useReplane();
      contexts.push(context);
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

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toBe(contexts[1]);
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
      const { client: contextClient } = useReplane();
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
