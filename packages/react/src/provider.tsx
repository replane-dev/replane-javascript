import { useMemo } from "react";
import { ReplaneContext } from "./context";
import { useReplaneClient, useReplaneClientSuspense } from "./useReplaneClient";
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
function ReplaneProviderWithClient<T extends Record<string, unknown>>({
  client,
  children,
}: ReplaneProviderWithClientProps<T>) {
  const value = useMemo<ReplaneContextValue<T>>(() => ({ client }), [client]);
  return <ReplaneContext.Provider value={value}>{children}</ReplaneContext.Provider>;
}

/**
 * Internal provider component for options-based client creation (non-suspense).
 */
function ReplaneProviderWithOptions<T extends Record<string, unknown>>({
  options,
  children,
  loader,
  onError,
}: ReplaneProviderWithOptionsProps<T>) {
  const state = useReplaneClient<T>(options, onError);

  if (state.status === "loading") {
    return <>{loader ?? null}</>;
  }

  if (state.status === "error") {
    // Error was already reported via onError callback
    // Return loader or null to prevent rendering children without a client
    return <>{loader ?? null}</>;
  }

  const value: ReplaneContextValue<T> = { client: state.client };
  return <ReplaneContext.Provider value={value}>{children}</ReplaneContext.Provider>;
}

/**
 * Internal provider component for options-based client creation with Suspense.
 */
function ReplaneProviderWithSuspense<T extends Record<string, unknown>>({
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
 * Can be used in two ways:
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
 * <ReplaneProvider
 *   options={{ baseUrl: '...', sdkKey: '...' }}
 *   loader={<LoadingSpinner />}
 * >
 *   <App />
 * </ReplaneProvider>
 * ```
 *
 * 3. With Suspense:
 * ```tsx
 * <Suspense fallback={<LoadingSpinner />}>
 *   <ReplaneProvider
 *     options={{ baseUrl: '...', sdkKey: '...' }}
 *     suspense
 *   >
 *     <App />
 *   </ReplaneProvider>
 * </Suspense>
 * ```
 */
export function ReplaneProvider<T extends Record<string, unknown>>(props: ReplaneProviderProps<T>) {
  if (hasClient(props)) {
    return <ReplaneProviderWithClient {...props} />;
  }

  if (props.suspense) {
    return <ReplaneProviderWithSuspense {...props} />;
  }

  return <ReplaneProviderWithOptions {...props} />;
}
