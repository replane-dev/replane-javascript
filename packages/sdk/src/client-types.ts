import type { ConfigDto } from "./types";

/**
 * Base type for config objects
 */
export type Configs = object;

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
export interface GetConfigOptions {
  /**
   * Context for override evaluation (merged with client-level context).
   */
  context?: ReplaneContext;
}

/**
 * Helper type for mapping configs to their names and values
 */
export type MapConfig<T extends Configs> = {
  [K in keyof T]: {
    name: K;
    value: T[K];
  };
}[keyof T];

/**
 * Serializable snapshot of the client state.
 * Can be used to restore a client on the client-side from server-fetched configs.
 */
export interface ReplaneSnapshot<_T extends Configs = Configs> {
  /** Serialized config data */
  configs: Array<{
    name: string;
    value: unknown;
    overrides: Array<{
      name: string;
      conditions: unknown[];
      value: unknown;
    }>;
  }>;
  /** Default context used for override evaluation */
  context?: ReplaneContext;
}

/**
 * The Replane client interface
 */
export interface ReplaneClient<T extends Configs> {
  /** Get a config by its name. */
  get<K extends keyof T>(configName: K, options?: GetConfigOptions): T[K];
  /** Subscribe to config changes.
   *  @param callback - A function to call when an config is changed. The callback will be called with the new config value.
   *  @returns A function to unsubscribe from the config changes.
   */
  subscribe(callback: (config: MapConfig<T>) => void): () => void;
  /** Subscribe to a specific config change.
   *  @param configName - The name of the config to subscribe to.
   *  @param callback - A function to call when the config is changed. The callback will be called with the new config value.
   *  @returns A function to unsubscribe from the config changes.
   */
  subscribe<K extends keyof T>(
    configName: K,
    callback: (config: MapConfig<Pick<T, K>>) => void
  ): () => void;
  /**
   * Get a serializable snapshot of the current client state.
   * Useful for SSR/hydration scenarios where you want to pass configs from server to client.
   */
  getSnapshot(): ReplaneSnapshot<T>;
  /** Close the client and clean up resources. */
  close(): void;
}

/**
 * Options for creating a Replane client
 */
export interface ReplaneClientOptions<T extends Configs> {
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
   * Custom fetch implementation (useful for tests / polyfills).
   */
  fetchFn?: typeof fetch;
  /**
   * Optional timeout in ms for the request.
   * @default 2000
   */
  requestTimeoutMs?: number;
  /**
   * Optional timeout in ms for the SDK initialization.
   * @default 5000
   */
  initializationTimeoutMs?: number;
  /**
   * Delay between retries in ms.
   * @default 200
   */
  retryDelayMs?: number;
  /**
   * Timeout in ms for SSE connection inactivity.
   * If no events (including pings) are received within this time, the connection will be re-established.
   * @default 30000
   */
  inactivityTimeoutMs?: number;
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
   * Required configs for the client.
   * If a config is not present, the client will throw an error during initialization.
   * @example
   * {
   *   required: {
   *     config1: true,
   *     config2: true,
   *     config3: false,
   *   },
   * }
   *
   * @example
   * {
   *   required: ["config1", "config2", "config3"],
   * }
   */
  required?:
    | {
        [K in keyof T]: boolean;
      }
    | Array<keyof T>;

  /**
   * Fallback values to use if the initial request to fetch configs fails.
   * When provided, all configs must be specified.
   * @example
   * {
   *   fallbacks: {
   *     config1: "value1",
   *     config2: 42,
   *   },
   * }
   */
  fallbacks?: {
    [K in keyof T]: T[K];
  };
}

/**
 * Options for restoring a Replane client from a snapshot
 */
export interface RestoreReplaneClientOptions<T extends Configs> {
  /**
   * Snapshot from a server-side client's getSnapshot() call.
   */
  snapshot: ReplaneSnapshot<T>;
  /**
   * Optional connection options for live updates.
   * If provided, the client will connect to the Replane server for real-time config updates.
   * If not provided, the client will only use the snapshot data (no live updates).
   */
  connection?: {
    /**
     * Base URL of the Replane instance (no trailing slash).
     */
    baseUrl: string;
    /**
     * Project SDK key for authorization.
     */
    sdkKey: string;
    /**
     * Custom fetch implementation (useful for tests / polyfills).
     */
    fetchFn?: typeof fetch;
    /**
     * Optional timeout in ms for the request.
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
    /**
     * Optional logger (defaults to console).
     */
    logger?: ReplaneLogger;
  };
  /**
   * Override the context from the snapshot.
   */
  context?: ReplaneContext;
}

/**
 * Internal options after processing user options
 */
export interface ReplaneFinalOptions {
  baseUrl: string;
  fetchFn: typeof fetch;
  requestTimeoutMs: number;
  initializationTimeoutMs: number;
  inactivityTimeoutMs: number;
  sdkKey: string;
  logger: ReplaneLogger;
  retryDelayMs: number;
  context: ReplaneContext;
  requiredConfigs: string[];
  fallbacks: ConfigDto[];
}
