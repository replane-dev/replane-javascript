export interface ReplaneClientOptions {
  /** Base URL of the Replane API (no trailing slash). */
  baseUrl: string;
  /** Custom fetch implementation (useful for tests / polyfills). */
  fetchFn?: typeof fetch;
  /**
   * Optional timeout in ms for the request.
   * @default 1000
   */
  timeoutMs?: number;
  /** Project API key for authorization. */
  apiKey: string;
  /** Optional logger (defaults to console). */
  logger?: ReplaneLogger;
}

interface ReplaneFinalOptions {
  baseUrl: string;
  fetchFn: typeof fetch;
  timeoutMs: number;
  apiKey: string;
  logger: ReplaneLogger;
}

export interface ReplaneLogger {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}

const defaultLogger: ReplaneLogger = console;

/** Internal helper adding timeout support around fetch. */
// Use a looser 'any' for input to avoid depending on DOM lib types.
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

export interface GetConfigOptions<T> extends Partial<ReplaneClientOptions> {
  /** Fallback value if config is not found. */
  fallback?: T;
}

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

export class ReplaneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplaneError";
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
  if (!sdkOptions.apiKey) throw new Error("API key is required");

  async function getConfigValue<T = unknown>(
    configName: string,
    inputOptions: GetConfigOptions<T> = {}
  ): Promise<T> {
    const combinedOptions = combineOptions(sdkOptions, inputOptions);
    const url = `${combinedOptions.baseUrl}/api/v1/configs/${encodeURIComponent(
      configName
    )}/value`;
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${combinedOptions.apiKey}`,
          Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        },
      },
      combinedOptions.timeoutMs,
      combinedOptions.fetchFn
    );

    if (res.status === 404) {
      throw new ReplaneError(`Config not found: ${configName}`);
    }

    let body: unknown = await res.json();

    if (!res.ok) {
      throw new ReplaneError(
        `Error fetching config "${configName}": ${res.status} ${
          res.statusText
        }${typeof body === "string" ? ` - ${body}` : ""}`
      );
    }

    return body as T;
  }

  const watchers = new Set<ConfigValueWatcher<any>>();

  async function watchConfigValue<T = unknown>(
    configName: string,
    originalOptions: GetConfigOptions<T> = {}
  ): Promise<ConfigValueWatcher<T>> {
    const options = { ...originalOptions };
    let currentWatcherValue: T = await getConfigValue<T>(configName, options);
    let isWatcherClosed = false;

    const intervalId = setInterval(async () => {
      currentWatcherValue = await getConfigValue<T>(configName, options);
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
    timeoutMs: overrides.timeoutMs ?? defaults.timeoutMs ?? 5000,
    logger: overrides.logger ?? defaults.logger ?? defaultLogger,
  };
}
