import { useMemo } from "react";
import { ReplaneContext } from "./context";
import { useReplaneClientInternal, useReplaneClientSuspense } from "./useReplaneClient";
import type {
  ReplaneProviderProps,
  ReplaneProviderWithClientProps,
  ReplaneProviderWithOptionsProps,
  ReplaneContextValue,
} from "./types";
import { hasClient } from "./types";

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
 * Errors during client initialization are thrown during rendering,
 * allowing them to be caught by React Error Boundaries.
 */
export function ReplaneProvider<T extends object>(props: ReplaneProviderProps<T>) {
  if (hasClient(props)) {
    return <ReplaneProviderWithClient {...props} />;
  }

  if (props.suspense) {
    return <ReplaneProviderWithSuspense {...props} />;
  }

  return <ReplaneProviderWithOptions {...props} />;
}
