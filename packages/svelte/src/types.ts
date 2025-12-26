import type { Replane, ReplaneSnapshot, ReplaneContext, ReplaneLogger } from "@replanejs/sdk";
import type { Snippet } from "svelte";

/**
 * Context value containing the Replane client
 */
export interface ReplaneContextValue<T extends object = Record<string, unknown>> {
  client: Replane<T>;
}

/**
 * Combined options for ReplaneContext.
 * Includes both constructor options (context, logger, defaults) and connection options.
 */
export interface ReplaneContextOptions<T extends object = Record<string, unknown>> {
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
 * Props for ReplaneContext when using a pre-created client.
 */
export interface ReplaneContextWithClientProps<T extends object = Record<string, unknown>> {
  /** Pre-created Replane client instance */
  client: Replane<T>;
  /** Children snippet */
  children: Snippet;
}

/**
 * Props for ReplaneContext when letting it manage the client internally.
 */
export interface ReplaneContextWithOptionsProps<T extends object = Record<string, unknown>> {
  /** Options to create or restore the Replane client */
  options: ReplaneContextOptions<T>;
  /** Children snippet */
  children: Snippet;
  /**
   * Optional snapshot from server-side rendering.
   * When provided, the client will be restored from the snapshot synchronously
   * instead of fetching configs from the server.
   * The `options` will be used for live updates connection if provided.
   */
  snapshot?: ReplaneSnapshot<T>;
  /**
   * Optional loading snippet to show while the client is initializing.
   * If not provided, children will not render until ready.
   * Ignored when snapshot is provided (restoration is synchronous).
   */
  loader?: Snippet;
}

export type ReplaneContextProps<T extends object = Record<string, unknown>> =
  | ReplaneContextWithClientProps<T>
  | ReplaneContextWithOptionsProps<T>;

/**
 * Type guard to check if props contain a pre-created client.
 */
export function hasClient<T extends object>(
  props: ReplaneContextProps<T>
): props is ReplaneContextWithClientProps<T> {
  return "client" in props && props.client !== undefined;
}

/**
 * Type guard to check if props contain options (with or without snapshot).
 */
export function hasOptions<T extends object>(
  props: ReplaneContextProps<T>
): props is ReplaneContextWithOptionsProps<T> {
  return "options" in props && props.options !== undefined;
}
