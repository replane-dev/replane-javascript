import type { ConfigDto } from "./types";
import type {
  ReplaneContext,
  ReplaneLogger,
  GetConfigOptions,
  MapConfig,
  ReplaneSnapshot,
  ReplaneClient,
  ReplaneClientOptions,
  RestoreReplaneClientOptions,
  ReplaneFinalOptions,
} from "./client-types";
import type { ReplaneStorage } from "./storage";
import { ReplaneRemoteStorage } from "./storage";
import { ReplaneError, ReplaneErrorCode } from "./error";
import { evaluateOverrides } from "./evaluation";
import { Deferred } from "./utils";

/**
 * Internal options for creating the client core
 */
interface ClientCoreOptions {
  initialConfigs: ConfigDto[];
  context: ReplaneContext;
  logger: ReplaneLogger;
  storage: ReplaneStorage | null;
  streamOptions: ReplaneFinalOptions | null;
  requiredConfigs: string[];
}

/**
 * Result from creating the client core
 */
interface ClientCoreResult<T extends object> {
  client: ReplaneClient<T>;
  configs: Map<string, ConfigDto>;
  startStreaming: () => Promise<void>;
  clientReady: Deferred<void>;
}

/**
 * Creates the core client logic shared between createReplaneClient and restoreReplaneClient
 */
function createClientCore<T extends object = Record<string, unknown>>(
  options: ClientCoreOptions
): ClientCoreResult<T> {
  const { initialConfigs, context, logger, storage, streamOptions, requiredConfigs } = options;

  const configs: Map<string, ConfigDto> = new Map(
    initialConfigs.map((config) => [config.name, config])
  );

  const clientReady = new Deferred<void>();
  const configSubscriptions = new Map<keyof T, Set<(config: MapConfig<T>) => void>>();
  const clientSubscriptions = new Set<(config: MapConfig<T>) => void>();

  function processConfigUpdates(updatedConfigs: ConfigDto[]) {
    for (const config of updatedConfigs) {
      configs.set(config.name, {
        name: config.name,
        overrides: config.overrides,
        value: config.value,
      });
      for (const callback of clientSubscriptions) {
        callback({ name: config.name as keyof T, value: config.value as T[keyof T] });
      }
      for (const callback of configSubscriptions.get(config.name as keyof T) ?? []) {
        callback({ name: config.name as keyof T, value: config.value as T[keyof T] });
      }
    }
  }

  async function startStreaming(): Promise<void> {
    if (!storage || !streamOptions) return;

    try {
      const replicationStream = storage.startReplicationStream({
        ...streamOptions,
        getBody: () => ({
          currentConfigs: [...configs.values()].map((config) => ({
            name: config.name,
            overrides: config.overrides,
            value: config.value,
          })),
          requiredConfigs,
        }),
      });

      for await (const event of replicationStream) {
        const updatedConfigs: ConfigDto[] =
          event.type === "config_change" ? [event.config] : event.configs;
        processConfigUpdates(updatedConfigs);
        clientReady.resolve();
      }
    } catch (error) {
      logger.error("Replane: error in SSE connection:", error);
      clientReady.reject(error);
      throw error;
    }
  }

  function get<K extends keyof T>(
    configName: K,
    getConfigOptions: GetConfigOptions<T[K]> = {}
  ): T[K] {
    const config = configs.get(String(configName));

    if (config === undefined) {
      if ("default" in getConfigOptions) {
        return getConfigOptions.default as T[K];
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
        { ...context, ...(getConfigOptions?.context ?? {}) },
        logger
      );
    } catch (error) {
      logger.error(`Replane: error evaluating overrides for config ${String(configName)}:`, error);
      return config.value as T[K];
    }
  }

  const subscribe = (
    callbackOrConfigName: keyof T | ((config: MapConfig<T>) => void),
    callbackOrUndefined?: (config: MapConfig<T>) => void
  ) => {
    let configName: keyof T | undefined = undefined;
    let callback: (config: MapConfig<T>) => void;
    if (typeof callbackOrConfigName === "function") {
      callback = callbackOrConfigName;
    } else {
      configName = callbackOrConfigName as keyof T;
      if (callbackOrUndefined === undefined) {
        throw new Error("callback is required when config name is provided");
      }
      callback = callbackOrUndefined!;
    }

    // Wrap the callback to ensure that we have a unique reference
    const originalCallback = callback;
    callback = (...args: Parameters<typeof callback>) => {
      originalCallback(...args);
    };

    if (configName === undefined) {
      clientSubscriptions.add(callback);
      return () => {
        clientSubscriptions.delete(callback);
      };
    }

    if (!configSubscriptions.has(configName)) {
      configSubscriptions.set(configName, new Set());
    }
    configSubscriptions.get(configName)!.add(callback);
    return () => {
      configSubscriptions.get(configName)?.delete(callback);
      if (configSubscriptions.get(configName)?.size === 0) {
        configSubscriptions.delete(configName);
      }
    };
  };

  const getSnapshot = (): ReplaneSnapshot<T> => ({
    configs: [...configs.values()].map((config) => ({
      name: config.name,
      value: config.value,
      overrides: config.overrides.map((override) => ({
        name: override.name,
        conditions: override.conditions,
        value: override.value,
      })),
    })),
    context,
  });

  const close = () => storage?.close();

  const client: ReplaneClient<T> = {
    get,
    subscribe: subscribe as ReplaneClient<T>["subscribe"],
    getSnapshot,
    close,
  };

  return { client, configs, startStreaming, clientReady };
}

/**
 * Create a Replane client bound to an SDK key.
 *
 * @example
 * ```typescript
 * const client = await createReplaneClient({
 *   sdkKey: 'your-sdk-key',
 *   baseUrl: 'https://app.replane.dev'
 * });
 * const value = client.get('my-config');
 * ```
 */
export async function createReplaneClient<T extends object = Record<string, unknown>>(
  sdkOptions: ReplaneClientOptions<T>
): Promise<ReplaneClient<T>> {
  const storage = new ReplaneRemoteStorage();
  return await createReplaneClientInternal(toFinalOptions(sdkOptions), storage);
}

/**
 * Create a Replane client that uses in-memory storage.
 * Useful for testing or when you have static config values.
 *
 * @example
 * ```typescript
 * const client = createInMemoryReplaneClient({ 'my-config': 123 });
 * const value = client.get('my-config'); // 123
 * ```
 */
export function createInMemoryReplaneClient<T extends object = Record<string, unknown>>(
  initialData: T
): ReplaneClient<T> {
  return {
    get: (configName, options) => {
      const config = initialData[configName];
      if (config === undefined) {
        if (options && "default" in options) {
          return options.default as T[typeof configName];
        }
        throw new ReplaneError({
          message: `Config not found: ${String(configName)}`,
          code: ReplaneErrorCode.NotFound,
        });
      }
      return config;
    },
    subscribe: () => {
      return () => {};
    },
    getSnapshot: () => ({
      configs: Object.entries(initialData).map(([name, value]) => ({
        name,
        value,
        overrides: [],
      })),
    }),
    close: () => {},
  };
}

/**
 * Restore a Replane client from a snapshot.
 * This is useful for SSR/hydration scenarios where the server has already fetched configs.
 *
 * @example
 * ```typescript
 * // On the server:
 * const serverClient = await createReplaneClient({ ... });
 * const snapshot = serverClient.getSnapshot();
 * // Pass snapshot to client via props/serialization
 *
 * // On the client:
 * const client = restoreReplaneClient({
 *   snapshot,
 *   connection: { sdkKey, baseUrl }
 * });
 * const value = client.get('my-config');
 * ```
 */
export function restoreReplaneClient<T extends object = Record<string, unknown>>(
  options: RestoreReplaneClientOptions<T>
): ReplaneClient<T> {
  const { snapshot, connection } = options;
  const context = options.context ?? snapshot.context ?? {};
  const logger = connection?.logger ?? console;

  // Initialize configs from snapshot
  const initialConfigs: ConfigDto[] = snapshot.configs.map((config) => ({
    name: config.name,
    value: config.value,
    overrides: config.overrides,
  }));

  let storage: ReplaneRemoteStorage | null = null;
  let streamOptions: ReplaneFinalOptions | null = null;

  if (connection) {
    storage = new ReplaneRemoteStorage();
    streamOptions = {
      sdkKey: connection.sdkKey,
      baseUrl: connection.baseUrl.replace(/\/+$/, ""),
      fetchFn: connection.fetchFn ?? globalThis.fetch.bind(globalThis),
      requestTimeoutMs: connection.requestTimeoutMs ?? 2000,
      initializationTimeoutMs: 5000, // Not used for restore
      inactivityTimeoutMs: connection.inactivityTimeoutMs ?? 30_000,
      logger,
      retryDelayMs: connection.retryDelayMs ?? 200,
      context,
      requiredConfigs: [],
      fallbacks: [],
    };
  }

  const { client, startStreaming } = createClientCore<T>({
    initialConfigs,
    context,
    logger,
    storage,
    streamOptions,
    requiredConfigs: [],
  });

  // Start streaming in background (non-blocking) if connection is provided
  if (storage && streamOptions) {
    startStreaming().catch((error) => {
      logger.error("Replane: error in restored client SSE connection:", error);
    });
  }

  return client;
}

/**
 * Internal function to create a Replane client with the given options and storage
 */
async function createReplaneClientInternal<T extends object = Record<string, unknown>>(
  sdkOptions: ReplaneFinalOptions,
  storage: ReplaneStorage
): Promise<ReplaneClient<T>> {
  if (!sdkOptions.sdkKey) throw new Error("SDK key is required");

  const { client, configs, startStreaming, clientReady } = createClientCore<T>({
    initialConfigs: sdkOptions.fallbacks,
    context: sdkOptions.context,
    logger: sdkOptions.logger,
    storage,
    streamOptions: sdkOptions,
    requiredConfigs: sdkOptions.requiredConfigs,
  });

  // Start streaming in background
  startStreaming().catch((error) => {
    sdkOptions.logger.error("Replane: error initializing client:", error);
  });

  const initializationTimeoutId = setTimeout(() => {
    if (sdkOptions.fallbacks.length === 0) {
      // no fallbacks, we have nothing to work with
      client.close();

      clientReady.reject(
        new ReplaneError({
          message: "Replane client initialization timed out",
          code: ReplaneErrorCode.Timeout,
        })
      );

      return;
    }

    const missingRequiredConfigs: string[] = [];
    for (const requiredConfigName of sdkOptions.requiredConfigs) {
      if (!configs.has(requiredConfigName)) {
        missingRequiredConfigs.push(requiredConfigName);
      }
    }

    if (missingRequiredConfigs.length > 0) {
      client.close();
      clientReady.reject(
        new ReplaneError({
          message: `Required configs are missing: ${missingRequiredConfigs.join(", ")}`,
          code: ReplaneErrorCode.NotFound,
        })
      );

      return;
    }

    clientReady.resolve();
  }, sdkOptions.initializationTimeoutMs);

  clientReady.promise.then(() => clearTimeout(initializationTimeoutId));

  await clientReady.promise;

  return client;
}

/**
 * Convert user options to final options with defaults
 */
function toFinalOptions<T extends object>(defaults: ReplaneClientOptions<T>): ReplaneFinalOptions {
  return {
    sdkKey: defaults.sdkKey ?? "",
    baseUrl: (defaults.baseUrl ?? "").replace(/\/+$/, ""),
    fetchFn:
      defaults.fetchFn ??
      // some browsers require binding the fetch function to window
      globalThis.fetch.bind(globalThis),
    requestTimeoutMs: defaults.requestTimeoutMs ?? 2000,
    initializationTimeoutMs: defaults.initializationTimeoutMs ?? 5000,
    inactivityTimeoutMs: defaults.inactivityTimeoutMs ?? 30_000,
    logger: defaults.logger ?? console,
    retryDelayMs: defaults.retryDelayMs ?? 200,
    context: {
      ...(defaults.context ?? {}),
    },
    requiredConfigs: Array.isArray(defaults.required)
      ? defaults.required.map((name) => String(name))
      : Object.entries(defaults.required ?? {})
          .filter(([_, value]) => value !== undefined)
          .map(([name]) => name),
    fallbacks: Object.entries(defaults.fallbacks ?? {})
      .filter(([_, value]) => value !== undefined)
      .map(([name, value]) => ({
        name,
        overrides: [],
        version: -1,
        value,
      })),
  };
}
