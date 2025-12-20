/**
 * Server-side utilities for Replane in Next.js.
 *
 * These functions are designed to be used in:
 * - React Server Components (RSC)
 * - getServerSideProps
 * - API routes
 * - Server Actions
 *
 * @example
 * ```tsx
 * // app/layout.tsx (Server Component)
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
 */

import {
  createReplaneClient,
  type ReplaneClientOptions,
  type ReplaneSnapshot,
  type ReplaneContext,
} from "@replanejs/sdk";

export type { ReplaneSnapshot, ReplaneContext };

export interface GetReplaneSnapshotOptions<T extends object = Record<string, unknown>> {
  /**
   * Base URL of the Replane instance (no trailing slash).
   */
  baseUrl: string;

  /**
   * Project SDK key for authorization.
   */
  sdkKey: string;

  /**
   * Custom fetch implementation (useful for caching configuration).
   * In Next.js, you can use the fetch options for caching:
   * ```ts
   * fetchFn: (url, init) => fetch(url, { ...init, next: { revalidate: 60 } })
   * ```
   */
  fetchFn?: typeof fetch;

  /**
   * Optional timeout in ms for the request.
   * @default 2000
   */
  requestTimeoutMs?: number;

  /**
   * Optional timeout in ms for initialization.
   * @default 5000
   */
  initializationTimeoutMs?: number;

  /**
   * Default context used for override evaluation.
   * This context will be included in the snapshot.
   */
  context?: ReplaneContext;

  /**
   * Config names that must be present before the client is ready.
   */
  required?: ReplaneClientOptions<T>["required"];

  /**
   * Fallback values to use if configs are not available.
   */
  fallbacks?: ReplaneClientOptions<T>["fallbacks"];
}

/**
 * Fetch configs from Replane and return a serializable snapshot.
 *
 * This is the primary server-side function for Next.js integration.
 * It creates a Replane client, waits for initialization, captures a snapshot,
 * and closes the client.
 *
 * The snapshot can be passed to `ReplaneNextProvider` for client-side hydration.
 *
 * @example
 * ```tsx
 * // In a Server Component
 * const snapshot = await getReplaneSnapshot({
 *   baseUrl: process.env.REPLANE_BASE_URL!,
 *   sdkKey: process.env.REPLANE_SDK_KEY!,
 *   context: { userId: user.id },
 * });
 * ```
 *
 * @example
 * ```tsx
 * // With Next.js caching
 * const snapshot = await getReplaneSnapshot({
 *   baseUrl: process.env.REPLANE_BASE_URL!,
 *   sdkKey: process.env.REPLANE_SDK_KEY!,
 *   fetchFn: (url, init) => fetch(url, {
 *     ...init,
 *     next: { revalidate: 60 }, // Revalidate every 60 seconds
 *   }),
 * });
 * ```
 */
export async function getReplaneSnapshot<T extends object = Record<string, unknown>>(
  options: GetReplaneSnapshotOptions<T>
): Promise<ReplaneSnapshot<T>> {
  const client = await createReplaneClient<T>({
    baseUrl: options.baseUrl,
    sdkKey: options.sdkKey,
    fetchFn: options.fetchFn,
    requestTimeoutMs: options.requestTimeoutMs,
    initializationTimeoutMs: options.initializationTimeoutMs,
    context: options.context,
    required: options.required,
    fallbacks: options.fallbacks,
  });

  try {
    return client.getSnapshot();
  } finally {
    client.close();
  }
}

/**
 * Get a config value directly on the server.
 *
 * This is useful when you need a single config value in a Server Component
 * or server-side code and don't need the full snapshot/hydration flow.
 *
 * Note: This creates a new client for each call, so prefer `getReplaneSnapshot`
 * if you need multiple configs or client-side hydration.
 *
 * @example
 * ```tsx
 * // In a Server Component
 * const maintenanceMode = await getConfig<boolean>({
 *   name: "maintenance-mode",
 *   baseUrl: process.env.REPLANE_BASE_URL!,
 *   sdkKey: process.env.REPLANE_SDK_KEY!,
 * });
 *
 * if (maintenanceMode) {
 *   return <MaintenancePage />;
 * }
 * ```
 */
export async function getConfig<T>(options: {
  name: string;
  baseUrl: string;
  sdkKey: string;
  fetchFn?: typeof fetch;
  requestTimeoutMs?: number;
  initializationTimeoutMs?: number;
  context?: ReplaneContext;
}): Promise<T> {
  const client = await createReplaneClient({
    baseUrl: options.baseUrl,
    sdkKey: options.sdkKey,
    fetchFn: options.fetchFn,
    requestTimeoutMs: options.requestTimeoutMs,
    initializationTimeoutMs: options.initializationTimeoutMs,
    context: options.context,
  });

  try {
    return client.get(options.name, { context: options.context }) as T;
  } finally {
    client.close();
  }
}
