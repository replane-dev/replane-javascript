"use client";

import { useEffect, useMemo, useRef } from "react";
import { Replane, type ConnectOptions } from "@replanejs/sdk";
import { ReplaneContext } from "./context";
import { useReplaneClientInternal, useReplaneClientSuspense } from "./useReplaneClient";
import type {
  ReplaneProviderProps,
  ReplaneProviderWithClientProps,
  ReplaneProviderWithOptionsProps,
  ReplaneContextValue,
} from "./types";
import { hasClient } from "./types";
import { DEFAULT_AGENT } from "./version";

/**
 * Internal provider component for pre-created client.
 */
function ReplaneProviderWithClient<T extends object>({
  client,
  children,
}: ReplaneProviderWithClientProps<T>) {
  const value = useMemo<ReplaneContextValue<T>>(() => ({ replane: client }), [client]);
  return <ReplaneContext.Provider value={value}>{children}</ReplaneContext.Provider>;
}

/**
 * Internal provider component for creating a Replane client asynchronously.
 * Creates a Replane client synchronously and connects in background.
 */
function AsyncReplaneProvider<T extends object>({
  children,
  connection,
  ...options
}: ReplaneProviderWithOptionsProps<T>) {
  const replaneRef = useRef<Replane<T>>(undefined as unknown as Replane<T>);

  if (!replaneRef.current) {
    replaneRef.current = new Replane<T>(options);
  }

  const connectionJson = connection ? JSON.stringify(connection) : undefined;

  useEffect(() => {
    const parsedConnection = connectionJson ? JSON.parse(connectionJson) : undefined;
    if (!parsedConnection) {
      return;
    }

    replaneRef.current.connect(parsedConnection).catch((err) => {
      (options.logger ?? console)?.error("Failed to connect Replane client", err);
    });

    return () => {
      replaneRef.current.disconnect();
    };
  }, [connectionJson, options.logger]);

  const value = useMemo<ReplaneContextValue<T>>(() => ({ replane: replaneRef.current }), []);
  return <ReplaneContext.Provider value={value}>{children}</ReplaneContext.Provider>;
}

/**
 * Internal provider component for options-based client creation (non-suspense).
 * Throws errors during rendering so they can be caught by Error Boundaries.
 */
function LoaderReplaneProvider<T extends object>({
  children,
  loader,
  connection,
  ...options
}: ReplaneProviderWithOptionsProps<T> & { connection: ConnectOptions }) {
  if (!connection) {
    throw new Error("Connection is required when using Loader");
  }
  const state = useReplaneClientInternal<T>(options, connection);

  if (state.status === "loading") {
    return <>{loader ?? null}</>;
  }

  if (state.status === "error") {
    // Throw error during render so it can be caught by Error Boundary
    throw state.error;
  }

  const value: ReplaneContextValue<T> = { replane: state.client };
  return <ReplaneContext.Provider value={value}>{children}</ReplaneContext.Provider>;
}

/**
 * Internal provider component for options-based client creation with Suspense.
 */
function SuspenseReplaneProvider<T extends object>({
  connection,
  children,
  ...options
}: ReplaneProviderWithOptionsProps<T> & { connection: ConnectOptions }) {
  if (!connection) {
    throw new Error("Connection is required when using Suspense");
  }
  const client = useReplaneClientSuspense<T>(options, connection);
  const value = useMemo<ReplaneContextValue<T>>(() => ({ replane: client }), [client]);
  return <ReplaneContext.Provider value={value}>{children}</ReplaneContext.Provider>;
}

/**
 * Provider component that makes a Replane client available to the component tree.
 *
 * Can be used in several ways:
 *
 * 1. With a pre-created client:
 * ```tsx
 * const client = new Replane({ defaults: { ... } });
 * await client.connect({ baseUrl: '...', sdkKey: '...' });
 * <ReplaneProvider client={client}>
 *   <App />
 * </ReplaneProvider>
 * ```
 *
 * 2. With options (client managed internally):
 * ```tsx
 * <ErrorBoundary fallback={<ErrorMessage />}>
 *   <ReplaneProvider
 *     options={{ baseUrl: '...', sdkKey: '...' }}
 *     loader={<LoadingSpinner />}
 *   >
 *     <App />
 *   </ReplaneProvider>
 * </ErrorBoundary>
 * ```
 *
 * 3. With Suspense:
 * ```tsx
 * <ErrorBoundary fallback={<ErrorMessage />}>
 *   <Suspense fallback={<LoadingSpinner />}>
 *     <ReplaneProvider
 *       options={{ baseUrl: '...', sdkKey: '...' }}
 *       suspense
 *     >
 *       <App />
 *     </ReplaneProvider>
 *   </Suspense>
 * </ErrorBoundary>
 * ```
 *
 * 4. With a snapshot (for SSR/hydration):
 * ```tsx
 * // On the server, get a snapshot from the client
 * const snapshot = serverClient.getSnapshot();
 *
 * // On the client, restore from the snapshot with live updates
 * <ReplaneProvider
 *   options={{ baseUrl: '...', sdkKey: '...' }}
 *   snapshot={snapshot}
 * >
 *   <App />
 * </ReplaneProvider>
 * ```
 *
 * Errors during client initialization are thrown during rendering,
 * allowing them to be caught by React Error Boundaries.
 */
export function ReplaneProvider<T extends object>(props: ReplaneProviderProps<T>) {
  const originalConnection = (props as { connection?: ConnectOptions }).connection;
  const connection = useMemo(
    () =>
      originalConnection
        ? {
            ...originalConnection,
            agent: originalConnection.agent ?? DEFAULT_AGENT,
          }
        : undefined,
    [originalConnection]
  );

  if (hasClient(props)) {
    return <ReplaneProviderWithClient {...props} />;
  }

  if (props.snapshot || !connection || props.async) {
    return <AsyncReplaneProvider {...props} />;
  }

  if (props.suspense) {
    return <SuspenseReplaneProvider {...props} connection={connection} />;
  }

  return <LoaderReplaneProvider {...props} connection={connection} />;
}
