/**
 * @replanejs/next - Next.js SDK for Replane
 *
 * This package provides Next.js-specific components and utilities for
 * integrating Replane with SSR and client-side hydration.
 *
 * ## Quick Start
 *
 * 1. Fetch the snapshot on the server:
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
 * 2. Use configs in client components:
 * ```tsx
 * "use client";
 * import { useConfig } from "@replanejs/next";
 *
 * export function MyComponent() {
 *   const featureEnabled = useConfig<boolean>("my-feature");
 *   return featureEnabled ? <NewFeature /> : <OldFeature />;
 * }
 * ```
 *
 * ## Why use the snapshot pattern?
 *
 * The snapshot pattern minimizes latency by:
 * - Fetching configs on the server during SSR (no client-side request delay)
 * - Instantly hydrating the client with server-fetched data
 * - Optionally connecting to Replane for real-time updates after hydration
 *
 * This means users see the correct feature flags immediately without any
 * loading states or flashes of incorrect content.
 *
 * @module
 */

// Main provider for Next.js SSR hydration
export { ReplaneNextProvider } from "./provider";

// Script-based hydration (alternative pattern)
export { ReplaneScriptProvider, getReplaneSnapshotScript } from "./script";

// Re-export types
export type {
  ReplaneNextProviderProps,
  ReplaneConnectionOptions,
} from "./types";
export type { ReplaneScriptProviderProps } from "./script";

// Re-export from React SDK for convenience
export { useReplane, useConfig } from "@replanejs/react";
export type { ReplaneContextValue } from "@replanejs/react";

// Re-export essential types from SDK
export type {
  ReplaneSnapshot,
  ReplaneClient,
  ReplaneContext,
  ReplaneError,
} from "@replanejs/sdk";

// Re-export restoration function for advanced use cases
export { restoreReplaneClient } from "@replanejs/sdk";
