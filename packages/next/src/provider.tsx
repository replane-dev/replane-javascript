"use client";

import { useMemo, useRef, useEffect } from "react";
import { ReplaneProvider } from "@replanejs/react";
import { restoreReplaneClient, type ReplaneClient } from "@replanejs/sdk";
import type { ReplaneNextProviderProps } from "./types";

/**
 * Next.js-optimized Replane provider with SSR hydration support.
 *
 * This component:
 * 1. Restores the Replane client from a server-side snapshot instantly (no loading state)
 * 2. Optionally connects to Replane for real-time updates
 * 3. Preserves the client across re-renders for minimal latency
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { getReplaneSnapshot } from "@replanejs/next/server";
 * import { ReplaneNextProvider } from "@replanejs/next";
 *
 * export default async function RootLayout({ children }) {
 *   const snapshot = await getReplaneSnapshot({
 *     baseUrl: process.env.REPLANE_BASE_URL!,
 *     sdkKey: process.env.REPLANE_SDK_KEY!,
 *   });
 *
 *   return (
 *     <html>
 *       <body>
 *         <ReplaneNextProvider
 *           snapshot={snapshot}
 *           connection={{
 *             baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
 *             sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
 *           }}
 *         >
 *           {children}
 *         </ReplaneNextProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Without real-time updates (static snapshot only)
 * <ReplaneNextProvider snapshot={snapshot}>
 *   {children}
 * </ReplaneNextProvider>
 * ```
 */
export function ReplaneNextProvider<T extends object = Record<string, unknown>>({
  snapshot,
  connection,
  context,
  children,
}: ReplaneNextProviderProps<T>) {
  // Use a ref to store the client to preserve it across re-renders
  // This is important for minimizing latency - we don't want to recreate
  // the client on every render
  const clientRef = useRef<ReplaneClient<T> | null>(null);

  // Create a stable key for the client based on snapshot and connection
  // We only recreate the client if these change
  const clientKey = useMemo(() => {
    const snapshotKey = JSON.stringify(snapshot.configs.map((c) => c.name).sort());
    const connectionKey = connection ? `${connection.baseUrl}:${connection.sdkKey}` : "no-connection";
    const contextKey = context ? JSON.stringify(context) : "no-context";
    return `${snapshotKey}:${connectionKey}:${contextKey}`;
  }, [snapshot, connection, context]);

  // Memoize client creation
  const client = useMemo(() => {
    // If we have a cached client with the same key, reuse it
    if (clientRef.current) {
      // Check if we need to create a new client
      // For simplicity, we always create a new client if the key changes
      // This happens when snapshot or connection changes
    }

    const newClient = restoreReplaneClient<T>({
      snapshot,
      connection: connection
        ? {
            baseUrl: connection.baseUrl,
            sdkKey: connection.sdkKey,
            requestTimeoutMs: connection.requestTimeoutMs,
            retryDelayMs: connection.retryDelayMs,
            inactivityTimeoutMs: connection.inactivityTimeoutMs,
          }
        : undefined,
      context,
    });

    clientRef.current = newClient;
    return newClient;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }
    };
  }, []);

  return <ReplaneProvider client={client}>{children}</ReplaneProvider>;
}
