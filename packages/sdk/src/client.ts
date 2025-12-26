import type { ConfigDto } from "./types";
import type {
  ReplaneContext,
  ReplaneLogger,
  GetConfigOptions,
  MapConfig,
  ReplaneSnapshot,
  ReplaneOptions,
  ConnectOptions,
  ConnectFinalOptions,
} from "./client-types";
import { ReplaneRemoteStorage } from "./storage";
import { ReplaneError, ReplaneErrorCode } from "./error";
import { evaluateOverrides } from "./evaluation";
import { Deferred } from "./utils";
import { DEFAULT_AGENT } from "./version";

/**
 * The Replane client for managing dynamic configuration.
 *
 * @example
 * ```typescript
 * // Create client with defaults
 * const client = new Replane({
 *   defaults: { myConfig: 'defaultValue' }
 * });
 *
 * // Use immediately (returns defaults)
 * const value = client.get('myConfig');
 *
 * // Connect for real-time updates
 * await client.connect({
 *   baseUrl: 'https://app.replane.dev',
 *   sdkKey: 'your-sdk-key'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // SSR/Hydration: Create from snapshot
 * const client = new Replane({
 *   snapshot: serverSnapshot
 * });
 * await client.connect({ baseUrl, sdkKey });
 * ```
 *
 * @example
 * ```typescript
 * // In-memory mode (no connection)
 * const client = new Replane({
 *   defaults: { feature: true, limit: 100 }
 * });
 * // Don't call connect() - works entirely in-memory
 * ```
 */
export class Replane<T extends object = Record<string, unknown>> {
  private configs: Map<string, ConfigDto>;
  private context: ReplaneContext;
  private logger: ReplaneLogger;
  private storage: ReplaneRemoteStorage | null = null;
  private configSubscriptions = new Map<keyof T, Set<(config: MapConfig<T>) => void>>();
  private clientSubscriptions = new Set<(config: MapConfig<T>) => void>();

  /**
   * Create a new Replane client.
   *
   * The client is usable immediately after construction with defaults or snapshot data.
   * Call `connect()` to establish a real-time connection for live updates.
   *
   * @param options - Configuration options
   */
  constructor(options: ReplaneOptions<T> = {}) {
    this.logger = options.logger ?? console;
    this.context = { ...(options.context ?? {}) };

    // Initialize configs from snapshot or defaults
    const initialConfigs: ConfigDto[] = [];

    // Add snapshot configs first (they take precedence)
    if (options.snapshot) {
      for (const config of options.snapshot.configs) {
        initialConfigs.push({
          name: config.name,
          value: config.value,
          overrides: config.overrides,
        });
      }
    }

    // Add defaults (only if not already in snapshot)
    if (options.defaults) {
      const snapshotNames = new Set(initialConfigs.map((c) => c.name));
      for (const [name, value] of Object.entries(options.defaults)) {
        if (value !== undefined && !snapshotNames.has(name)) {
          initialConfigs.push({
            name,
            value,
            overrides: [],
          });
        }
      }
    }

    this.configs = new Map(initialConfigs.map((config) => [config.name, config]));
  }

  /**
   * Connect to the Replane server for real-time config updates.
   *
   * This method establishes an SSE connection to receive live config updates.
   * If already connected, it will disconnect first and reconnect with new options.
   *
   * @param options - Connection options including baseUrl and sdkKey
   * @returns Promise that resolves when the initial connection is established
   * @throws {ReplaneError} If connection times out and no defaults are available
   *
   * @example
   * ```typescript
   * await client.connect({
   *   baseUrl: 'https://app.replane.dev',
   *   sdkKey: 'rp_xxx'
   * });
   * ```
   */
  async connect(options: ConnectOptions): Promise<void> {
    // Disconnect if already connected
    this.disconnect();

    const finalOptions = this.toFinalOptions(options);
    this.storage = new ReplaneRemoteStorage();

    const clientReady = new Deferred<void>();

    // Start streaming in background
    this.startStreaming(finalOptions, clientReady);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      this.disconnect();
      clientReady.reject(
        new ReplaneError({
          message: "Replane client connection timed out",
          code: ReplaneErrorCode.Timeout,
        })
      );
    }, finalOptions.connectTimeoutMs);

    clientReady.promise.finally(() => clearTimeout(timeoutId));

    await clientReady.promise;
  }

  /**
   * Disconnect from the Replane server.
   *
   * Stops the SSE connection and cleans up resources.
   * The client remains usable with cached config values.
   * Can call `connect()` again to reconnect.
   */
  disconnect(): void {
    if (this.storage) {
      this.storage.disconnect();
      this.storage = null;
    }
  }

  /**
   * Get a config value by name.
   *
   * Evaluates any overrides based on the client context and per-call context.
   *
   * @param configName - The name of the config to retrieve
   * @param options - Optional settings for this call
   * @returns The config value
   * @throws {ReplaneError} If config not found and no default provided
   *
   * @example
   * ```typescript
   * // Simple get
   * const value = client.get('myConfig');
   *
   * // With default fallback
   * const value = client.get('myConfig', { default: 'fallback' });
   *
   * // With per-call context for override evaluation
   * const value = client.get('myConfig', { context: { userId: '123' } });
   * ```
   */
  get<K extends keyof T>(configName: K, options: GetConfigOptions<T[K]> = {}): T[K] {
    const config = this.configs.get(String(configName));

    if (config === undefined) {
      if ("default" in options) {
        return options.default as T[K];
      }
      throw new ReplaneError({
        message: `Config not found: ${String(configName)}`,
        code: ReplaneErrorCode.NotFound,
      });
    }

    try {
      return evaluateOverrides<T[K]>(
        config.value as T[K],
        config.overrides,
        { ...this.context, ...(options?.context ?? {}) },
        this.logger
      );
    } catch (error) {
      this.logger.error(
        `Replane: error evaluating overrides for config ${String(configName)}:`,
        error
      );
      return config.value as T[K];
    }
  }

  /**
   * Subscribe to config changes.
   *
   * @param callback - Function called when any config changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = client.subscribe((change) => {
   *   console.log(`Config ${change.name} changed to ${change.value}`);
   * });
   *
   * // Later: stop listening
   * unsubscribe();
   * ```
   */
  subscribe(callback: (config: MapConfig<T>) => void): () => void;

  /**
   * Subscribe to a specific config's changes.
   *
   * @param configName - The config to watch
   * @param callback - Function called when the config changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = client.subscribe('myConfig', (change) => {
   *   console.log(`myConfig changed to ${change.value}`);
   * });
   * ```
   */
  subscribe<K extends keyof T>(
    configName: K,
    callback: (config: { name: K; value: T[K] }) => void
  ): () => void;

  subscribe<K extends keyof T>(
    callbackOrConfigName: K | ((config: MapConfig<T>) => void),
    callbackOrUndefined?: (config: { name: K; value: T[K] }) => void
  ): () => void {
    let configName: keyof T | undefined = undefined;
    let callback: (config: MapConfig<T>) => void;

    if (typeof callbackOrConfigName === "function") {
      callback = callbackOrConfigName;
    } else {
      configName = callbackOrConfigName as keyof T;
      if (callbackOrUndefined === undefined) {
        throw new Error("callback is required when config name is provided");
      }
      // Type assertion is safe: MapConfig<T> is a union that includes { name: K, value: T[K] }
      callback = callbackOrUndefined as (config: MapConfig<T>) => void;
    }

    // Wrap the callback to ensure that we have a unique reference
    const originalCallback = callback;
    callback = (...args: Parameters<typeof callback>) => {
      originalCallback(...args);
    };

    if (configName === undefined) {
      this.clientSubscriptions.add(callback);
      return () => {
        this.clientSubscriptions.delete(callback);
      };
    }

    if (!this.configSubscriptions.has(configName)) {
      this.configSubscriptions.set(configName, new Set());
    }
    this.configSubscriptions.get(configName)!.add(callback);

    return () => {
      this.configSubscriptions.get(configName)?.delete(callback);
      if (this.configSubscriptions.get(configName)?.size === 0) {
        this.configSubscriptions.delete(configName);
      }
    };
  }

  /**
   * Get a serializable snapshot of the current client state.
   *
   * Useful for SSR/hydration scenarios where you want to pass
   * configs from server to client.
   *
   * @returns Snapshot object that can be serialized to JSON
   *
   * @example
   * ```typescript
   * // On server
   * const snapshot = client.getSnapshot();
   * const json = JSON.stringify(snapshot);
   *
   * // On client
   * const client = new Replane({ snapshot: JSON.parse(json) });
   * ```
   */
  getSnapshot(): ReplaneSnapshot<T> {
    return {
      configs: [...this.configs.values()].map((config) => ({
        name: config.name,
        value: config.value,
        overrides: config.overrides.map((override) => ({
          name: override.name,
          conditions: override.conditions,
          value: override.value,
        })),
      })),
    };
  }

  /**
   * Check if the client is currently connected.
   */
  get isConnected(): boolean {
    return this.storage !== null;
  }

  private async startStreaming(
    options: ConnectFinalOptions,
    clientReady: Deferred<void>
  ): Promise<void> {
    if (!this.storage) return;

    try {
      const replicationStream = this.storage.startReplicationStream({
        ...options,
        logger: this.logger,
        getBody: () => ({
          currentConfigs: [...this.configs.values()].map((config) => ({
            name: config.name,
            overrides: config.overrides,
            value: config.value,
          })),
          requiredConfigs: [],
        }),
      });

      for await (const event of replicationStream) {
        const updatedConfigs: ConfigDto[] =
          event.type === "config_change" ? [event.config] : event.configs;
        this.processConfigUpdates(updatedConfigs);
        clientReady.resolve();
      }
    } catch (error) {
      this.logger.error("Replane: error in SSE connection:", error);
      clientReady.reject(error);
      throw error;
    }
  }

  private processConfigUpdates(updatedConfigs: ConfigDto[]): void {
    for (const config of updatedConfigs) {
      this.configs.set(config.name, {
        name: config.name,
        overrides: config.overrides,
        value: config.value,
      });

      const change = { name: config.name as keyof T, value: config.value as T[keyof T] };

      for (const callback of this.clientSubscriptions) {
        callback(change);
      }
      for (const callback of this.configSubscriptions.get(config.name as keyof T) ?? []) {
        callback(change);
      }
    }
  }

  private toFinalOptions(options: ConnectOptions): ConnectFinalOptions {
    return {
      sdkKey: options.sdkKey,
      baseUrl: (options.baseUrl ?? "").replace(/\/+$/, ""),
      fetchFn:
        options.fetchFn ??
        // some browsers require binding the fetch function to window
        globalThis.fetch.bind(globalThis),
      requestTimeoutMs: options.requestTimeoutMs ?? 2000,
      connectTimeoutMs: options.connectTimeoutMs ?? 5000,
      inactivityTimeoutMs: options.inactivityTimeoutMs ?? 30_000,
      retryDelayMs: options.retryDelayMs ?? 200,
      agent: options.agent ?? DEFAULT_AGENT,
    };
  }
}
