import type { Replane, ReplaneSnapshot, ReplaneContext, ReplaneLogger } from "@replanejs/sdk";
import type { ReactNode } from "react";

export type UntypedReplaneConfig = Record<string, unknown>;

export interface ReplaneContextValue<T extends object = UntypedReplaneConfig> {
  replane: Replane<T>;
}

/**
 * Combined options for ReplaneProvider.
 * Includes both constructor options (context, logger, defaults) and connection options.
 */
export interface ReplaneProviderOptions<T extends object = UntypedReplaneConfig> {
  /**
   * Base URL of the Replane instance (no trailing slash).
   * @example "https://app.replane.dev"
   */
  baseUrl: string;
  /**
   * Project SDK key for authorization.
   * @example "rp_XXXXXXXXX"
   */
  sdkKey: string;
  /**
   * Default context for all config evaluations.
   * Can be overridden per-request in `client.get()`.
   */
  context?: ReplaneContext;
  /**
   * Optional logger (defaults to console).
   */
  logger?: ReplaneLogger;
  /**
   * Default values to use before connection is established.
   */
  defaults?: { [K in keyof T]?: T[K] };
  /**
   * Optional timeout in ms for the initial connection.
   * @default 5000
   */
  connectTimeoutMs?: number;
  /**
   * Delay between retries in ms.
   * @default 200
   */
  retryDelayMs?: number;
  /**
   * Optional timeout in ms for individual requests.
   * @default 2000
   */
  requestTimeoutMs?: number;
  /**
   * Timeout in ms for SSE connection inactivity.
   * @default 30000
   */
  inactivityTimeoutMs?: number;
  /**
   * Custom fetch implementation (useful for tests / polyfills).
   */
  fetchFn?: typeof fetch;
  /**
   * Agent identifier sent in User-Agent header.
   */
  agent?: string;
}

/**
 * Props for ReplaneProvider when using a pre-created client.
 */
export interface ReplaneProviderWithClientProps<T extends object = UntypedReplaneConfig> {
  /** Pre-created Replane client instance */
  client: Replane<T>;
  children: ReactNode;
}

/**
 * Props for ReplaneProvider when letting it manage the client internally.
 */
export interface ReplaneProviderWithOptionsProps<T extends object = UntypedReplaneConfig> {
  /** Options to create or restore the Replane client */
  options: ReplaneProviderOptions<T>;
  children: ReactNode;
  /**
   * Optional snapshot from server-side rendering.
   * When provided, the client will be restored from the snapshot synchronously
   * instead of fetching configs from the server.
   * The `options` will be used for live updates connection if provided.
   */
  snapshot?: ReplaneSnapshot<T>;
  /**
   * Optional loading component to show while the client is initializing.
   * If not provided and suspense is false/undefined, children will not render until ready.
   * Ignored when snapshot is provided (restoration is synchronous).
   */
  loader?: ReactNode;
  /**
   * If true, uses React Suspense for loading state.
   * The provider will throw a promise that Suspense can catch.
   * Ignored when snapshot is provided (restoration is synchronous).
   * @default false
   */
  suspense?: boolean;
}

export type ReplaneProviderProps<T extends object = UntypedReplaneConfig> =
  | ReplaneProviderWithClientProps<T>
  | ReplaneProviderWithOptionsProps<T>;

/**
 * Type guard to check if props contain a pre-created client.
 */
export function hasClient<T extends object>(
  props: ReplaneProviderProps<T>
): props is ReplaneProviderWithClientProps<T> {
  return "client" in props && props.client !== undefined;
}

/**
 * Type guard to check if props contain options (with or without snapshot).
 */
export function hasOptions<T extends object>(
  props: ReplaneProviderProps<T>
): props is ReplaneProviderWithOptionsProps<T> {
  return "options" in props && props.options !== undefined;
}
