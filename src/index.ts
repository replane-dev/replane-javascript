export interface ReplaneClientOptions {
  /** Base URL of the Replane API (no trailing slash). */
  baseUrl: string;
  /** Custom fetch implementation (useful for tests / polyfills). */
  fetchFn?: typeof fetch;
  /** Optional timeout in ms for the request. */
  timeoutMs?: number;
  /** API key for authorization. */
  apiKey: string;
}

export class ReplaneError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ReplaneError";
    this.status = status;
    this.body = body;
  }
}

/** Internal helper adding timeout support around fetch. */
// Use a looser 'any' for input to avoid depending on DOM lib types.
async function fetchWithTimeout(
  input: any,
  init: RequestInit,
  timeoutMs?: number,
  fetchFn?: typeof fetch
) {
  const fn = fetchFn ?? (globalThis.fetch as typeof fetch | undefined);
  if (!fn) {
    throw new Error("Global fetch is not available. Provide options.fetchFn.");
  }
  if (!timeoutMs) return fn(input, init);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export interface GetConfigOptions extends Partial<ReplaneClientOptions> {}

/** Shape of a successful config value response.
 * The API might just return the raw value. We accept unknown to stay flexible.
 */
export type ConfigValue<T = unknown> = T;

export interface ReplaneClient {
  /** Fetch a config value by name. */
  getConfig<T = unknown>(
    name: string,
    options?: GetConfigOptions
  ): Promise<ConfigValue<T>>;
}

/**
 * Create a Replane client bound to an API key.
 * Usage:
 *   const client = createReplaneClient({ apiKey: 'your-api-key', baseUrl: 'https://app.replane.dev' })
 *   const value = await client.getConfig('my-config')
 */
export function createReplaneClient(
  options: ReplaneClientOptions
): ReplaneClient {
  if (!options.apiKey) throw new Error("API key is required");

  return {
    async getConfig<T = unknown>(
      name: string,
      perCallOptions: GetConfigOptions = {}
    ): Promise<ConfigValue<T>> {
      if (!name) throw new Error("config name is required");
      const finalOptions = { ...options, ...perCallOptions };
      const finalBase = finalOptions.baseUrl.replace(/\/$/, "");
      const url = `${finalBase}/api/v1/configs/${encodeURIComponent(
        name
      )}/value`;
      const res = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${finalOptions.apiKey}`,
            Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
          },
        },
        perCallOptions.timeoutMs ?? finalOptions.timeoutMs,
        perCallOptions.fetchFn ?? finalOptions.fetchFn
      );

      let body: unknown = null;
      const contentType = res.headers.get("content-type") || "";
      try {
        if (contentType.includes("application/json")) body = await res.json();
        else body = await res.text();
      } catch (e) {
        // ignore body parse errors; body stays null
      }

      if (!res.ok) {
        throw new ReplaneError(
          `Failed to fetch config "${name}" (status ${res.status})`,
          res.status,
          body
        );
      }

      return body as T;
    },
  };
}
