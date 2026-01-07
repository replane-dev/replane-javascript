import type { Override } from "./types";

/**
 * Context object for override evaluation.
 * Keys are property names, values can be strings, numbers, booleans, null, or undefined.
 */
export type ReplaneContext = Record<string, string | number | boolean | null | undefined>;

/**
 * Logger interface for SDK logging
 */
export interface ReplaneLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Options for getting a config value
 */
export interface GetConfigOptions<T> {
  /**
   * Context for override evaluation (merged with client-level context).
   */
  context?: ReplaneContext;
  /**
   * Default value to return if the config is not found.
   * When provided, the method will not throw if the config doesn't exist.
   */
  default?: T;
}

/**
 * Helper type for mapping configs to their names and values
 */
export type MapConfig<T extends object> = {
  [K in keyof T]: {
    name: K;
    value: T[K];
  };
}[keyof T];

/**
 * Serializable snapshot of the client state.
 * Can be used to restore a client on the client-side from server-fetched configs.
 */
export interface ReplaneSnapshot<_T extends object = object> {
  /** Serialized config data */
  configs: Array<{
    name: string;
    value: unknown;
    overrides: Override[];
  }>;
}

/**
 * Options for the Replane constructor
 */
export interface ReplaneOptions<T extends object> {
  /**
   * Optional logger (defaults to console).
   */
  logger?: ReplaneLogger;
  /**
   * Default context for all config evaluations.
   * Can be overridden per-request in `client.get()`.
   */
  context?: ReplaneContext;
  /**
   * Default values to use before connection is established.
   * These values are used immediately and can be overwritten by server data.
   * @example
   * {
   *   defaults: {
   *     config1: "value1",
   *     config2: 42,
   *   },
   * }
   */
  defaults?: {
    [K in keyof T]?: T[K];
  };
  /**
   * Snapshot from a server-side client's getSnapshot() call.
   * Used for SSR/hydration scenarios.
   */
  snapshot?: ReplaneSnapshot<T>;
}

/**
 * Options for connecting to the Replane server
 */
export interface ConnectOptions {
  /**
   * Base URL of the Replane instance (no trailing slash).
   * @example
   * "https://app.replane.dev"
   *
   * @example
   * "https://replane.yourdomain.com"
   */
  baseUrl: string;
  /**
   * Project SDK key for authorization.
   * @example
   * "rp_XXXXXXXXX"
   */
  sdkKey: string;
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
   * If no events (including pings) are received within this time, the connection will be re-established.
   * @default 30000
   */
  inactivityTimeoutMs?: number;
  /**
   * Custom fetch implementation (useful for tests / polyfills).
   */
  fetchFn?: typeof fetch;
  /**
   * Agent identifier sent in User-Agent header.
   * Defaults to SDK identifier (e.g., "replane-js/x.y.z").
   */
  agent?: string;
}

/**
 * Internal options after processing connect options
 */
export interface ConnectFinalOptions {
  baseUrl: string;
  sdkKey: string;
  connectTimeoutMs: number;
  retryDelayMs: number;
  requestTimeoutMs: number;
  inactivityTimeoutMs: number;
  fetchFn: typeof fetch;
  agent: string;
}

/**
 * Internal representation of initial configs
 */
export interface InitialConfig {
  name: string;
  value: unknown;
  overrides: Override[];
}
