"use client";

import { useEffect, useState, useMemo, useRef, type ReactNode } from "react";
import { ReplaneProvider } from "@replanejs/react";
import { restoreReplaneClient, type ReplaneSnapshot, type ReplaneClient } from "@replanejs/sdk";
import type { ReplaneConnectionOptions } from "./types";

// Global variable name for the snapshot
const REPLANE_SNAPSHOT_KEY = "__REPLANE_SNAPSHOT__";

type AnyConfig = Record<string, unknown>;

declare global {
  interface Window {
    [REPLANE_SNAPSHOT_KEY]?: ReplaneSnapshot<AnyConfig>;
  }
}

/**
 * Generate the script content for embedding the snapshot.
 *
 * Use this in a Server Component to embed the snapshot in the page:
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { getReplaneSnapshot } from "@replanejs/next/server";
 * import { getReplaneSnapshotScript, ReplaneScriptProvider } from "@replanejs/next";
 *
 * export default async function RootLayout({ children }) {
 *   const snapshot = await getReplaneSnapshot({ ... });
 *
 *   return (
 *     <html>
 *       <head>
 *         <script
 *           dangerouslySetInnerHTML={{
 *             __html: getReplaneSnapshotScript(snapshot),
 *           }}
 *         />
 *       </head>
 *       <body>
 *         <ReplaneScriptProvider connection={{ ... }}>
 *           {children}
 *         </ReplaneScriptProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function getReplaneSnapshotScript<T extends object = AnyConfig>(
  snapshot: ReplaneSnapshot<T>
): string {
  // Escape script closing tags in JSON to prevent XSS
  const json = JSON.stringify(snapshot).replace(/<\/script>/gi, "<\\/script>");
  return `window.${REPLANE_SNAPSHOT_KEY}=${json};`;
}

/**
 * Props for ReplaneScriptProvider.
 */
export interface ReplaneScriptProviderProps {
  /**
   * Connection options for real-time updates.
   * If not provided, the client will only use the snapshot data (no live updates).
   */
  connection?: ReplaneConnectionOptions;

  /**
   * Fallback to render while waiting for the snapshot.
   * This should rarely be needed since the script is in the head.
   */
  fallback?: ReactNode;

  children: ReactNode;
}

/**
 * Provider that reads the snapshot from a script tag.
 *
 * Use this with `getReplaneSnapshotScript()` for an alternative hydration pattern
 * where the snapshot is embedded in a script tag instead of passed as a prop.
 *
 * This pattern can be useful for:
 * - Pages with heavy component trees where prop drilling is inconvenient
 * - Partial hydration scenarios
 * - When you want the snapshot to be available before React hydrates
 *
 * @example
 * ```tsx
 * // In app/layout.tsx (Server Component)
 * <script dangerouslySetInnerHTML={{ __html: getReplaneSnapshotScript(snapshot) }} />
 *
 * // In a client component
 * <ReplaneScriptProvider connection={{ baseUrl, sdkKey }}>
 *   <App />
 * </ReplaneScriptProvider>
 * ```
 */
export function ReplaneScriptProvider({
  connection,
  fallback,
  children,
}: ReplaneScriptProviderProps) {
  const [snapshot, setSnapshot] = useState<ReplaneSnapshot<AnyConfig> | null>(() => {
    // Try to get snapshot from window on initial render (SSR-safe)
    if (typeof window !== "undefined" && window[REPLANE_SNAPSHOT_KEY]) {
      return window[REPLANE_SNAPSHOT_KEY];
    }
    return null;
  });

  const clientRef = useRef<ReplaneClient<AnyConfig> | null>(null);

  // Check for snapshot on mount (in case the script runs after initial render)
  useEffect(() => {
    if (!snapshot && typeof window !== "undefined" && window[REPLANE_SNAPSHOT_KEY]) {
      setSnapshot(window[REPLANE_SNAPSHOT_KEY]);
    }
  }, [snapshot]);

  // Create client from snapshot
  const client = useMemo(() => {
    if (!snapshot) return null;

    const newClient = restoreReplaneClient({
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
    });

    clientRef.current = newClient;
    return newClient;
  }, [snapshot, connection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }
    };
  }, []);

  if (!client) {
    return <>{fallback ?? null}</>;
  }

  return <ReplaneProvider client={client}>{children}</ReplaneProvider>;
}
