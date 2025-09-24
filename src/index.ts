interface ReplaneStorage {
  getConfigValue<T>(
    configName: string,
    options: ReplaneFinalOptions
  ): Promise<T>;
  close(): void;
}

async function fetchWithTimeout(
  input: any,
  init: RequestInit,
  timeoutMs: number,
  fetchFn: typeof fetch
) {
  if (!fetchFn) {
    throw new Error("Global fetch is not available. Provide options.fetchFn.");
  }
  if (!timeoutMs) return fetchFn(input, init);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries: number;
    delayMs: number;
    logger: ReplaneLogger;
    name: string;
    isRetryable: (e: any) => boolean;
  }
): Promise<T> {
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (
        attempt < options.retries &&
        (!options.isRetryable || options.isRetryable(e))
      ) {
        const jitter = options.delayMs / 5;
        const delayMs = options.delayMs + Math.random() * jitter - jitter / 2;
        options.logger.warn(
          `${options.name}: attempt ${
            attempt + 1
          } failed: ${e}. Retrying in ${delayMs}ms...`
        );
        await delay(delayMs);
        continue;
      }
      throw e;
    }
  }
  throw new Error("Unreachable");
}

class ReplaneRemoteStorage implements ReplaneStorage {
  async getConfigValue<T>(
    configName: string,
    options: ReplaneFinalOptions
  ): Promise<T> {
    return await retry(
      async () => {
        try {
          const url = `${options.baseUrl}/api/v1/configs/${encodeURIComponent(
            configName
          )}/value`;
          const response = await fetchWithTimeout(
            url,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${options.apiKey}`,
                Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
              },
            },
            options.timeoutMs,
            options.fetchFn
          );

          if (response.status === 404) {
            throw new ReplaneError({
              message: `Config not found: ${configName}`,
              code: ReplaneErrorCode.NotFound,
            });
          }

          if (response.status === 401) {
            throw new ReplaneError({
              message: `Unauthorized access: ${configName}`,
              code: ReplaneErrorCode.AuthError,
            });
          }

          if (response.status === 403) {
            throw new ReplaneError({
              message: `Forbidden access: ${configName}`,
              code: ReplaneErrorCode.Forbidden,
            });
          }

          if (!response.ok) {
            let body: unknown;
            try {
              body = await response.text();
            } catch {
              body = "<unable to read response body>";
            }

            const code =
              response.status >= 500
                ? ReplaneErrorCode.ServerError
                : response.status >= 400
                ? ReplaneErrorCode.ClientError
                : ReplaneErrorCode.Unknown;

            throw new ReplaneError({
              message: `Error fetching config "${configName}": ${response.status} ${response.statusText} - ${body}`,
              code,
            });
          }

          return (await response.json()) as T;
        } catch (e) {
          if (e instanceof ReplaneError) {
            throw e;
          }
          throw new ReplaneError({
            message: `Network error fetching config "${configName}": ${e}`,
            code: ReplaneErrorCode.NetworkError,
          });
        }
      },
      {
        delayMs: options.retryDelayMs,
        retries: options.retries,
        logger: options.logger,
        name: `fetch ${configName}`,
        isRetryable: (e) => {
          if (e instanceof ReplaneError) {
            return (
              e.code !== ReplaneErrorCode.NotFound &&
              e.code !== ReplaneErrorCode.AuthError &&
              e.code !== ReplaneErrorCode.Forbidden &&
              e.code !== ReplaneErrorCode.ClientError
            );
          }
          return true;
        },
      }
    );
  }

  close() {
    // No resources to clean up
  }
}

class ReplaneInMemoryStorage implements ReplaneStorage {
  private store: Map<string, any>;

  constructor(initialData: Record<string, any>) {
    this.store = new Map(Object.entries(initialData));
  }

  async getConfigValue<T>(configName: string): Promise<T> {
    if (!this.store.has(configName)) {
      throw new ReplaneError({
        message: `Config not found: ${configName}`,
        code: ReplaneErrorCode.NotFound,
      });
    }
    return this.store.get(configName) as T;
  }

  close() {
    // No resources to clean up
  }
}

export interface ReplaneClientOptions {
  /**
   * Base URL of the Replane API (no trailing slash).
   */
  baseUrl: string;
  /**
   * Project API key for authorization.
   */
  apiKey: string;
  /**
   * Custom fetch implementation (useful for tests / polyfills).
   */
  fetchFn?: typeof fetch;
  /**
   * Optional timeout in ms for the request.
   * @default 2000
   */
  timeoutMs?: number;
  /**
   * Number of retries for failed requests.
   * @default 2
   */
  retries?: number;
  /**
   * Delay between retries in ms.
   * @default 100
   */
  retryDelayMs?: number;
  /**
   * Optional logger (defaults to console).
   */
  logger?: ReplaneLogger;
}

interface ReplaneFinalOptions {
  baseUrl: string;
  fetchFn: typeof fetch;
  timeoutMs: number;
  apiKey: string;
  logger: ReplaneLogger;
  retries: number;
  retryDelayMs: number;
}

export interface ReplaneLogger {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}

export interface GetConfigOptions<T> extends Partial<ReplaneClientOptions> {}

export interface ConfigValueWatcher<T> {
  /** Current config value (or fallback if not found). */
  get(): T;
  /** Stop watching for changes. */
  close(): void;
}

export interface ReplaneClient {
  /** Fetch a config value by name. */
  getConfigValue<T = unknown>(
    configName: string,
    options?: GetConfigOptions<T>
  ): Promise<T | undefined>;
  /** Watch a config value by name. */
  watchConfigValue<T = unknown>(
    configName: string,
    options?: GetConfigOptions<T>
  ): Promise<ConfigValueWatcher<T>>;
  /** Close the client and clean up resources. */
  close(): void;
}

enum ReplaneErrorCode {
  NotFound = "not_found",
  NetworkError = "network_error",
  AuthError = "auth_error",
  Forbidden = "forbidden",
  ServerError = "server_error",
  ClientError = "client_error",
  Unknown = "unknown",
}

export class ReplaneError extends Error {
  code: string;
  constructor(params: { message: string; code: string }) {
    super(params.message);
    this.name = "ReplaneError";
    this.code = params.code;
  }
}

/**
 * Create a Replane client bound to an API key.
 * Usage:
 *   const client = createReplaneClient({ apiKey: 'your-api-key', baseUrl: 'https://app.replane.dev' })
 *   const value = await client.getConfig('my-config')
 */
export function createReplaneClient(
  sdkOptions: ReplaneClientOptions
): ReplaneClient {
  const storage = new ReplaneRemoteStorage();
  return _createReplaneClient(sdkOptions, storage);
}

/**
 * Create a Replane client that uses in-memory storage.
 * Usage:
 *   const client = createInMemoryReplaneClient({ 'my-config': 123 })
 *   const value = await client.getConfigValue('my-config') // 123
 */
export function createInMemoryReplaneClient(
  initialData: Record<string, any>
): ReplaneClient {
  const storage = new ReplaneInMemoryStorage(initialData);
  return _createReplaneClient(
    { apiKey: "test-api-key", baseUrl: "https://app.replane.dev" },
    storage
  );
}

function _createReplaneClient(
  sdkOptions: ReplaneClientOptions,
  storage: ReplaneStorage
): ReplaneClient {
  if (!sdkOptions.apiKey) throw new Error("API key is required");

  async function getConfigValue<T = unknown>(
    configName: string,
    inputOptions: GetConfigOptions<T> = {}
  ): Promise<T> {
    return await storage.getConfigValue<T>(
      configName,
      combineOptions(sdkOptions, inputOptions as Partial<ReplaneClientOptions>)
    );
  }

  const watchers = new Set<ConfigValueWatcher<any>>();

  async function watchConfigValue<T = unknown>(
    configName: string,
    originalOptions: GetConfigOptions<T> = {}
  ): Promise<ConfigValueWatcher<T>> {
    const options = combineOptions(sdkOptions, originalOptions);
    let currentWatcherValue: T = await storage.getConfigValue<T>(
      configName,
      options
    );
    let isWatcherClosed = false;

    const intervalId = setInterval(async () => {
      currentWatcherValue = await storage.getConfigValue<T>(
        configName,
        options
      );
    }, 60_000);

    const watcher: ConfigValueWatcher<T> = {
      get() {
        if (isWatcherClosed) {
          throw new Error("Config value watcher is closed");
        }
        return currentWatcherValue;
      },
      close() {
        if (isWatcherClosed) return;
        isWatcherClosed = true;

        clearInterval(intervalId);
        watchers.delete(watcher);
      },
    };

    watchers.add(watcher);

    return watcher;
  }

  let isClientClosed = false;

  function close() {
    if (isClientClosed) return;
    isClientClosed = true;

    watchers.forEach((w) => w.close());
  }

  return {
    getConfigValue: async (name, req) => {
      if (isClientClosed) {
        throw new Error("Replane client is closed");
      }
      return await getConfigValue(name, req);
    },
    watchConfigValue: async (name, options) => {
      if (isClientClosed) {
        throw new Error("Replane client is closed");
      }
      return await watchConfigValue(name, options);
    },
    close,
  };
}

function combineOptions(
  defaults: ReplaneClientOptions,
  overrides: Partial<ReplaneClientOptions>
): ReplaneFinalOptions {
  return {
    apiKey: overrides.apiKey ?? defaults.apiKey,
    baseUrl: (overrides.baseUrl ?? defaults.baseUrl).replace(/\/+$/, ""),
    fetchFn: overrides.fetchFn ?? defaults.fetchFn ?? globalThis.fetch,
    timeoutMs: overrides.timeoutMs ?? defaults.timeoutMs ?? 2000,
    logger: overrides.logger ?? defaults.logger ?? console,
    retries: overrides.retries ?? defaults.retries ?? 2,
    retryDelayMs: overrides.retryDelayMs ?? defaults.retryDelayMs ?? 100,
  };
}
