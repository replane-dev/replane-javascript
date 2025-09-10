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

export interface GetConfigRequest<T> extends Partial<ReplaneClientOptions> {
  /** Config name to fetch. */
  name: string;
  /** Fallback value if config is not found. */
  fallback: T;
}

export interface ReplaneClient {
  /** Fetch a config value by name. */
  getConfig<T = unknown>(req: GetConfigRequest<T>): Promise<T | undefined>;
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

  return {
    async getConfig<T = unknown>(req: GetConfigRequest<T>): Promise<T> {
      if (!req.name) throw new Error("config name is required");
      const finalOptions = combineOptions(sdkOptions, req);
      try {
        return await _getConfig<T>({
          configName: req.name,
          fallback: req.fallback,
          options: finalOptions,
        });
      } catch (err: unknown) {
        finalOptions.logger.error("ReplaneClient.getConfig error", err);
        return req.fallback;
      }
    },
  };
}

async function _getConfig<T>(params: {
  configName: string;
  fallback: T;
  options: ReplaneFinalOptions;
}): Promise<T> {
  const url = `${params.options.baseUrl}/api/v1/configs/${encodeURIComponent(
    params.configName
  )}/value`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.options.apiKey}`,
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
    },
    params.options.timeoutMs,
    params.options.fetchFn
  );

  let body: unknown = null;
  const contentType = res.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }
  } catch (e) {
    if (res.ok) {
      params.options.logger.error("ReplaneClient.getConfig invalid response", {
        name: params.configName,
        status: res.status,
        contentType,
      });
      return params.fallback;
    }
  }

  if (!res.ok) {
    params.options.logger.error("ReplaneClient.getConfig error", {
      name: params.configName,
      status: res.status,
      body,
    });

    return params.fallback;
  }

  return body as T;
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
