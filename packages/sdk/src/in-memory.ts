/**
 * Testing utilities for the Replane JavaScript SDK.
 *
 * This module provides an in-memory client for testing applications that use
 * Replane without requiring a real server connection.
 *
 * @example
 * ```typescript
 * import { InMemoryReplane } from "@replane/sdk/testing";
 *
 * // Create client with initial configs
 * const client = new InMemoryReplane({
 *   defaults: {
 *     "feature-enabled": true,
 *     "rate-limit": 100,
 *   },
 * });
 *
 * // Use in tests
 * expect(client.get("feature-enabled")).toBe(true);
 *
 * // Update config at runtime
 * client.set("feature-enabled", false);
 * expect(client.get("feature-enabled")).toBe(false);
 * ```
 */

import type { Override, ConfigDto } from "./types";
import type {
  ReplaneContext,
  ReplaneLogger,
  GetConfigOptions,
  MapConfig,
  ReplaneSnapshot,
} from "./client-types";
import { ReplaneError, ReplaneErrorCode } from "./error";
import { evaluateOverrides } from "./evaluation";

/**
 * Options for setting a config with overrides.
 */
export interface SetConfigOptions {
  /** Override rules for context-based value selection */
  overrides?: Override[];
}

/**
 * Options for InMemoryReplane constructor.
 */
export interface InMemoryReplaneOptions<T extends object> {
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
   * Initial config values.
   * @example
   * {
   *   defaults: {
   *     "feature-enabled": true,
   *     "rate-limit": 100,
   *   },
   * }
   */
  defaults?: {
    [K in keyof T]?: T[K];
  };
}

interface InMemoryReplaneHandle<T extends object> {
  _impl: InMemoryReplaneImpl<T>;
}

function asHandle<T extends object>(
  client: InMemoryReplane<T>
): InMemoryReplaneHandle<T> {
  return client as unknown as InMemoryReplaneHandle<T>;
}

/**
 * An in-memory Replane client for testing.
 *
 * This client provides the same interface as `Replane` but stores
 * all configs in memory. It's useful for unit tests where you don't want
 * to connect to a real Replane server.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const client = new InMemoryReplane({
 *   defaults: { "feature-enabled": true, "rate-limit": 100 },
 * });
 * expect(client.get("feature-enabled")).toBe(true);
 *
 * // Update config at runtime
 * client.set("feature-enabled", false);
 * expect(client.get("feature-enabled")).toBe(false);
 *
 * // With overrides
 * client.set("rate-limit", 100, {
 *   overrides: [{
 *     name: "premium-users",
 *     conditions: [{ operator: "equals", property: "plan", value: "premium" }],
 *     value: 1000,
 *   }],
 * });
 * expect(client.get("rate-limit")).toBe(100);
 * expect(client.get("rate-limit", { context: { plan: "premium" } })).toBe(1000);
 * ```
 *
 * @typeParam T - Type definition for config keys and values
 */
export class InMemoryReplane<T extends object = Record<string, unknown>> {
  constructor(options: InMemoryReplaneOptions<T> = {}) {
    asHandle(this)._impl = new InMemoryReplaneImpl<T>(options);
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
   */
  get<K extends keyof T>(configName: K, options?: GetConfigOptions<T[K]>): T[K] {
    return asHandle(this)._impl.get(configName, options);
  }

  /**
   * Subscribe to a specific config's changes.
   *
   * @param configName - The config to watch
   * @param callback - Function called when the config changes
   * @returns Unsubscribe function
   */
  subscribe<K extends keyof T>(
    configName: K,
    callback: (config: { name: K; value: T[K] }) => void
  ): () => void {
    return asHandle(this)._impl.subscribe(configName, callback);
  }

  /**
   * Get a serializable snapshot of the current client state.
   *
   * @returns Snapshot object that can be serialized to JSON
   */
  getSnapshot(): ReplaneSnapshot<T> {
    return asHandle(this)._impl.getSnapshot();
  }

  /**
   * Set a config with optional overrides.
   *
   * @param name - Config name
   * @param value - Base config value
   * @param options - Optional settings including overrides
   *
   * @example
   * ```typescript
   * client.set("rate-limit", 100, {
   *   overrides: [{
   *     name: "premium-users",
   *     conditions: [
   *       { operator: "in", property: "plan", value: ["pro", "enterprise"] }
   *     ],
   *     value: 1000,
   *   }],
   * });
   * ```
   */
  set<K extends keyof T>(name: K, value: T[K], options?: SetConfigOptions): void {
    asHandle(this)._impl.set(name, value, options);
  }

  /**
   * Delete a config.
   *
   * @param name - Config name to delete
   * @returns True if config was deleted, false if it didn't exist
   */
  delete<K extends keyof T>(name: K): boolean {
    return asHandle(this)._impl.delete(name);
  }

  /**
   * Clear all configs.
   */
  clear(): void {
    asHandle(this)._impl.clear();
  }

  /**
   * Check if a config exists.
   *
   * @param name - Config name to check
   * @returns True if config exists
   */
  has<K extends keyof T>(name: K): boolean {
    return asHandle(this)._impl.has(name);
  }

  /**
   * Get all config names.
   *
   * @returns Array of config names
   */
  keys(): (keyof T)[] {
    return asHandle(this)._impl.keys();
  }
}

// Implementation class to hide internal details from the public API
class InMemoryReplaneImpl<T extends object = Record<string, unknown>> {
  private configs: Map<string, ConfigDto>;
  private context: ReplaneContext;
  private logger: ReplaneLogger;
  private configSubscriptions = new Map<keyof T, Set<(config: MapConfig<T>) => void>>();

  constructor(options: InMemoryReplaneOptions<T> = {}) {
    this.logger = options.logger ?? console;
    this.context = options.context ?? {};

    // Initialize configs from defaults
    const initialConfigs: ConfigDto[] = [];

    if (options.defaults) {
      for (const [name, value] of Object.entries(options.defaults)) {
        if (value !== undefined) {
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

  subscribe<K extends keyof T>(
    configName: K,
    callback: (config: { name: K; value: T[K] }) => void
  ): () => void {
    const wrappedCallback = (config: MapConfig<T>) => {
      callback(config as { name: K; value: T[K] });
    };

    if (!this.configSubscriptions.has(configName)) {
      this.configSubscriptions.set(configName, new Set());
    }
    this.configSubscriptions.get(configName)!.add(wrappedCallback);

    return () => {
      this.configSubscriptions.get(configName)?.delete(wrappedCallback);
      if (this.configSubscriptions.get(configName)?.size === 0) {
        this.configSubscriptions.delete(configName);
      }
    };
  }

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

  set<K extends keyof T>(name: K, value: T[K], options?: SetConfigOptions): void {
    const overrides: Override[] = options?.overrides ?? [];

    const config: ConfigDto = {
      name: String(name),
      value,
      overrides,
    };

    this.configs.set(String(name), config);

    // Notify subscribers
    this.notifySubscribers(name, value);
  }

  delete<K extends keyof T>(name: K): boolean {
    const existed = this.configs.has(String(name));
    this.configs.delete(String(name));
    return existed;
  }

  clear(): void {
    this.configs.clear();
  }

  has<K extends keyof T>(name: K): boolean {
    return this.configs.has(String(name));
  }

  keys(): (keyof T)[] {
    return [...this.configs.keys()] as (keyof T)[];
  }

  private notifySubscribers<K extends keyof T>(name: K, value: T[K]): void {
    const change = { name, value };
    for (const callback of this.configSubscriptions.get(name) ?? []) {
      try {
        callback(change as MapConfig<T>);
      } catch (error) {
        this.logger.error(`Replane: error in subscription callback for ${String(name)}:`, error);
      }
    }
  }
}
