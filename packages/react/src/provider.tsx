"use client";

import { useMemo } from "react";
import { restoreReplaneClient } from "@replanejs/sdk";
import { ReplaneContext } from "./context";
import { useReplaneClientInternal, useReplaneClientSuspense } from "./useReplaneClient";
import { useStateful } from "./hooks";
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
  const value = useMemo<ReplaneContextValue<T>>(() => ({ client }), [client]);
  return <ReplaneContext.Provider value={value}>{children}</ReplaneContext.Provider>;
}

/**
 * Internal provider component for restoring client from snapshot.
 * Uses restoreReplaneClient which is synchronous.
 */
function ReplaneProviderWithSnapshot<T extends object>({
  options,
  snapshot,
  children,
}: ReplaneProviderWithOptionsProps<T> & {
  snapshot: NonNullable<ReplaneProviderWithOptionsProps<T>["snapshot"]>;
}) {
  const client = useStateful(
    () =>
      restoreReplaneClient<T>({
        snapshot,
        connection: {
          baseUrl: options.baseUrl,
          sdkKey: options.sdkKey,
          fetchFn: options.fetchFn,
          requestTimeoutMs: options.requestTimeoutMs,
          retryDelayMs: options.retryDelayMs,
          inactivityTimeoutMs: options.inactivityTimeoutMs,
          logger: options.logger,
          agent: options.agent ?? DEFAULT_AGENT,
        },
        context: options.context,
      }),
    (c) => c.close(),
    [snapshot, options]
  );
  const value = useMemo<ReplaneContextValue<T>>(() => ({ client }), [client]);
  return <ReplaneContext.Provider value={value}>{children}</ReplaneContext.Provider>;
}

/**
 * Internal provider component for options-based client creation (non-suspense).
 * Throws errors during rendering so they can be caught by Error Boundaries.
 */
function ReplaneProviderWithOptions<T extends object>({
  options,
  children,
  loader,
}: ReplaneProviderWithOptionsProps<T>) {
  const state = useReplaneClientInternal<T>(options);

  if (state.status === "loading") {
    return <>{loader ?? null}</>;
  }

  if (state.status === "error") {
    // Throw error during render so it can be caught by Error Boundary
    throw state.error;
  }

  const value: ReplaneContextValue<T> = { client: state.client };
  return <ReplaneContext.Provider value={value}>{children}</ReplaneContext.Provider>;
}

/**
 * Internal provider component for options-based client creation with Suspense.
 */
function ReplaneProviderWithSuspense<T extends object>({
  options,
  children,
}: ReplaneProviderWithOptionsProps<T>) {
  const client = useReplaneClientSuspense<T>(options);
  const value = useMemo<ReplaneContextValue<T>>(() => ({ client }), [client]);
  return <ReplaneContext.Provider value={value}>{children}</ReplaneContext.Provider>;
}

/**
 * Provider component that makes a ReplaneClient available to the component tree.
 *
 * Can be used in three ways:
 *
 * 1. With a pre-created client:
 * ```tsx
 * const client = await createReplaneClient({ ... });
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
  if (hasClient(props)) {
    return <ReplaneProviderWithClient {...props} />;
  }

  // Has options - check if snapshot is provided
  if (props.snapshot) {
    return <ReplaneProviderWithSnapshot {...props} snapshot={props.snapshot} />;
  }

  if (props.suspense) {
    return <ReplaneProviderWithSuspense {...props} />;
  }

  return <ReplaneProviderWithOptions {...props} />;
}
