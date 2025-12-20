import type { ReactNode } from "react";
import type { ReplaneSnapshot, ReplaneContext } from "@replanejs/sdk";

/**
 * Connection options for real-time updates.
 */
export interface ReplaneConnectionOptions {
  /**
   * Base URL of the Replane instance (no trailing slash).
   * Use a NEXT_PUBLIC_ prefixed env var for client-side access.
   */
  baseUrl: string;

  /**
   * Project SDK key for authorization.
   * Use a NEXT_PUBLIC_ prefixed env var for client-side access.
   */
  sdkKey: string;

  /**
   * Optional timeout in ms for requests.
   * @default 2000
   */
  requestTimeoutMs?: number;

  /**
   * Delay between retries in ms.
   * @default 200
   */
  retryDelayMs?: number;

  /**
   * Timeout in ms for SSE connection inactivity.
   * @default 30000
   */
  inactivityTimeoutMs?: number;
}

/**
 * Props for ReplaneNextProvider.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneNextProviderProps<T extends object = any> {
  /**
   * Serializable snapshot from the server.
   * Obtained from `getReplaneSnapshot()` in a Server Component or getServerSideProps.
   */
  snapshot: ReplaneSnapshot<T>;

  /**
   * Connection options for real-time updates.
   * If not provided, the client will only use the snapshot data (no live updates).
   *
   * For SSR apps that need real-time updates, provide connection options:
   * ```tsx
   * <ReplaneNextProvider
   *   snapshot={snapshot}
   *   connection={{
   *     baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
   *     sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
   *   }}
   * >
   *   {children}
   * </ReplaneNextProvider>
   * ```
   */
  connection?: ReplaneConnectionOptions;

  /**
   * Override the context from the snapshot on the client.
   * Useful for client-specific context like browser info.
   */
  context?: ReplaneContext;

  children: ReactNode;
}
