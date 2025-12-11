import type {
  RenderedOverride,
  RenderedCondition,
  ReplicationStreamRecord,
  StartReplicationStreamBody,
  ConfigDto,
} from "./types";

const SUPPORTED_REPLICATION_STREAM_RECORD_TYPES = Object.keys({
  config_change: true,
  init: true,
} satisfies Record<ReplicationStreamRecord["type"], true>);

/**
 * FNV-1a 32-bit hash function
 */
function fnv1a32(input: string): number {
  // Convert string to bytes (UTF-8)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);

  // FNV-1a core
  let hash = 0x811c9dc5 >>> 0; // 2166136261, force uint32

  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]; // XOR with byte
    hash = Math.imul(hash, 0x01000193) >>> 0; // * 16777619 mod 2^32
  }

  return hash >>> 0; // ensure unsigned 32-bit
}

/**
 * Convert FNV-1a hash to [0, 1) for bucketing.
 */
function fnv1a32ToUnit(input: string): number {
  const h = fnv1a32(input);
  return h / 2 ** 32; // double in [0, 1)
}

type EvaluationResult = "matched" | "not_matched" | "unknown";

/**
 * Evaluate config overrides based on context (client-side implementation)
 * This is a simplified version without debug info
 */
function evaluateOverrides<T>(
  baseValue: T,
  overrides: RenderedOverride[],
  context: ReplaneContext,
  logger: ReplaneLogger
): T {
  // Find first matching override
  for (const override of overrides) {
    // All conditions must match (implicit AND)
    let overrideResult: EvaluationResult = "matched";
    const results = override.conditions.map((c) => evaluateCondition(c, context, logger));
    // AND: false > unknown > true
    if (results.some((r) => r === "not_matched")) {
      overrideResult = "not_matched";
    } else if (results.some((r) => r === "unknown")) {
      overrideResult = "unknown";
    }

    // Only use override if all conditions matched (not unknown)
    if (overrideResult === "matched") {
      return override.value as T;
    }
  }

  return baseValue;
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(
  condition: RenderedCondition,
  context: ReplaneContext,
  logger: ReplaneLogger
): EvaluationResult {
  const operator = condition.operator;

  // Composite conditions
  if (operator === "and") {
    const results = condition.conditions.map((c) => evaluateCondition(c, context, logger));
    // AND: false > unknown > true
    if (results.some((r) => r === "not_matched")) return "not_matched";
    if (results.some((r) => r === "unknown")) return "unknown";
    return "matched";
  }

  if (operator === "or") {
    const results = condition.conditions.map((c) => evaluateCondition(c, context, logger));
    // OR: true > unknown > false
    if (results.some((r) => r === "matched")) return "matched";
    if (results.some((r) => r === "unknown")) return "unknown";
    return "not_matched";
  }

  if (operator === "not") {
    const result = evaluateCondition(condition.condition, context, logger);
    if (result === "matched") return "not_matched";
    if (result === "not_matched") return "matched";
    return "unknown"; // NOT unknown = unknown
  }

  // Segmentation
  if (operator === "segmentation") {
    const contextValue = context[condition.property];
    if (contextValue === undefined || contextValue === null) {
      return "unknown";
    }

    // FNV-1a hash to bucket [0, 100)
    const hashInput = String(contextValue) + condition.seed;
    const unitValue = fnv1a32ToUnit(hashInput);
    return unitValue >= condition.fromPercentage / 100 && unitValue < condition.toPercentage / 100
      ? "matched"
      : "not_matched";
  }

  // Property-based conditions
  const property = condition.property;
  const contextValue = context[property];
  const expectedValue = condition.value;

  if (contextValue === undefined) {
    return "unknown";
  }

  // Type casting
  const castedValue = castToContextType(expectedValue, contextValue);

  switch (operator) {
    case "equals":
      return contextValue === castedValue ? "matched" : "not_matched";

    case "in":
      if (!Array.isArray(castedValue)) return "unknown";
      return castedValue.includes(contextValue) ? "matched" : "not_matched";

    case "not_in":
      if (!Array.isArray(castedValue)) return "unknown";
      return !castedValue.includes(contextValue) ? "matched" : "not_matched";

    case "less_than":
      if (typeof contextValue === "number" && typeof castedValue === "number") {
        return contextValue < castedValue ? "matched" : "not_matched";
      }
      if (typeof contextValue === "string" && typeof castedValue === "string") {
        return contextValue < castedValue ? "matched" : "not_matched";
      }
      return "not_matched";

    case "less_than_or_equal":
      if (typeof contextValue === "number" && typeof castedValue === "number") {
        return contextValue <= castedValue ? "matched" : "not_matched";
      }
      if (typeof contextValue === "string" && typeof castedValue === "string") {
        return contextValue <= castedValue ? "matched" : "not_matched";
      }
      return "not_matched";

    case "greater_than":
      if (typeof contextValue === "number" && typeof castedValue === "number") {
        return contextValue > castedValue ? "matched" : "not_matched";
      }
      if (typeof contextValue === "string" && typeof castedValue === "string") {
        return contextValue > castedValue ? "matched" : "not_matched";
      }
      return "not_matched";

    case "greater_than_or_equal":
      if (typeof contextValue === "number" && typeof castedValue === "number") {
        return contextValue >= castedValue ? "matched" : "not_matched";
      }
      if (typeof contextValue === "string" && typeof castedValue === "string") {
        return contextValue >= castedValue ? "matched" : "not_matched";
      }
      return "not_matched";

    default:
      warnNever(operator, logger, `Unexpected operator: ${operator}`);
      return "unknown";
  }
}

function warnNever(value: never, logger: ReplaneLogger, message: string): void {
  logger.warn(message, { value });
}

/**
 * Cast expected value to match context value type
 */
function castToContextType(expectedValue: unknown, contextValue: unknown): unknown {
  if (typeof contextValue === "number") {
    if (typeof expectedValue === "string") {
      const num = Number(expectedValue);
      return isNaN(num) ? expectedValue : num;
    }
    return expectedValue;
  }

  if (typeof contextValue === "boolean") {
    if (typeof expectedValue === "string") {
      if (expectedValue === "true") return true;
      if (expectedValue === "false") return false;
    }
    if (typeof expectedValue === "number") {
      return expectedValue !== 0;
    }
    return expectedValue;
  }

  if (typeof contextValue === "string") {
    if (typeof expectedValue === "number" || typeof expectedValue === "boolean") {
      return String(expectedValue);
    }
    return expectedValue;
  }

  return expectedValue;
}

interface StartReplicationStreamReplaneStorageOptions extends ReplaneFinalOptions {
  // getBody is a function to get the latest configs when we are trying
  // to reestablish the replication stream
  getBody: () => StartReplicationStreamBody;
  signal?: AbortSignal;
  onConnect?: () => void;
}

type Configs = object;

interface ReplaneStorage {
  startReplicationStream(
    options: StartReplicationStreamReplaneStorageOptions
  ): AsyncIterable<ReplicationStreamRecord>;
  close(): void;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryDelay(averageDelay: number) {
  const jitter = averageDelay / 5;
  const delayMs = averageDelay + Math.random() * jitter - jitter / 2;

  await delay(delayMs);
}

class ReplaneRemoteStorage implements ReplaneStorage {
  private closeController = new AbortController();

  // never throws
  async *startReplicationStream(
    options: StartReplicationStreamReplaneStorageOptions
  ): AsyncIterable<ReplicationStreamRecord> {
    const { signal, cleanUpSignals } = combineAbortSignals([
      this.closeController.signal,
      options.signal,
    ]);
    try {
      let failedAttempts = 0;
      while (!signal.aborted) {
        try {
          for await (const event of this.startReplicationStreamImpl({
            ...options,
            signal,
            onConnect: () => {
              failedAttempts = 0;
            },
          })) {
            yield event;
          }
        } catch (error: unknown) {
          failedAttempts++;
          const retryDelayMs = Math.min(options.retryDelayMs * 2 ** (failedAttempts - 1), 10_000);
          if (!signal.aborted) {
            options.logger.error(
              `Failed to fetch project events, retrying in ${retryDelayMs}ms...`,
              error
            );

            await retryDelay(retryDelayMs);
          }
        }
      }
    } finally {
      cleanUpSignals();
    }
  }

  private async *startReplicationStreamImpl(
    options: StartReplicationStreamReplaneStorageOptions
  ): AsyncIterable<ReplicationStreamRecord> {
    const rawEvents = fetchSse({
      fetchFn: options.fetchFn,
      headers: {
        Authorization: this.getAuthHeader(options),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options.getBody()),
      timeoutMs: options.requestTimeoutMs,
      method: "POST",
      signal: options.signal,
      url: this.getApiEndpoint(`/sdk/v1/replication/stream`, options),
      onConnect: options.onConnect,
    });

    for await (const rawEvent of rawEvents) {
      const event = JSON.parse(rawEvent);
      if (
        typeof event === "object" &&
        event !== null &&
        "type" in event &&
        typeof event.type === "string" &&
        (SUPPORTED_REPLICATION_STREAM_RECORD_TYPES as unknown as string[]).includes(event.type)
      ) {
        yield event as ReplicationStreamRecord;
      }
    }
  }

  close() {
    this.closeController.abort();
  }

  private getAuthHeader(options: ReplaneFinalOptions): string {
    return `Bearer ${options.sdkKey}`;
  }

  private getApiEndpoint(path: string, options: ReplaneFinalOptions) {
    return `${options.baseUrl}/api${path}`;
  }
}

export type ReplaneContext = Record<string, unknown>;

export interface ReplaneClientOptions<T extends Configs> {
  /**
   * Base URL of the Replane API (no trailing slash).
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
   * Optional timeout in ms for the SDK initialization.
   * @default 5000
   */
  sdkInitializationTimeoutMs?: number;
  /**
   * Delay between retries in ms.
   * @default 100
   */
  retryDelayMs?: number;
  /**
   * Optional logger (defaults to console).
   */
  logger?: ReplaneLogger;
  /**
   * Default context for all config evaluations.
   * Can be overridden per-request in `client.watchConfig()` and `watcher.getValue()`.
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
   * Fallback configs to use if the initial request to fetch configs fails.
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

interface ReplaneFinalOptions {
  baseUrl: string;
  fetchFn: typeof fetch;
  requestTimeoutMs: number;
  sdkInitializationTimeoutMs: number;
  sdkKey: string;
  logger: ReplaneLogger;
  retryDelayMs: number;
  context: ReplaneContext;
  requiredConfigs: string[];
  fallbacks: ConfigDto[];
}

export interface ReplaneLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface GetConfigOptions {
  /**
   * Context for override evaluation (merged with client-level context).
   */
  context?: ReplaneContext;
}

export interface ConfigWatcher<T> {
  /** Current config value (or fallback if not found). */
  getValue(context?: ReplaneContext): T;
  /** Stop watching for changes. */
  close(): void;
}

export interface ReplaneClient<T extends Configs> {
  /** Get a config by its name. */
  getConfig<K extends keyof T>(configName: K, options?: GetConfigOptions): T[K];
  /** Close the client and clean up resources. */
  close(): void;
}

enum ReplaneErrorCode {
  NotFound = "not_found",
  Timeout = "timeout",
  NetworkError = "network_error",
  AuthError = "auth_error",
  Forbidden = "forbidden",
  ServerError = "server_error",
  ClientError = "client_error",
  Closed = "closed",
  NotInitialized = "not_initialized",
  Unknown = "unknown",
}

export class ReplaneError extends Error {
  code: string;
  constructor(params: { message: string; code: string; cause?: unknown }) {
    super(params.message, { cause: params.cause });
    this.name = "ReplaneError";
    this.code = params.code;
  }
}

/**
 * Create a Replane client bound to an SDK key.
 * Usage:
 *   const client = await createReplaneClient({ sdkKey: 'your-sdk-key', baseUrl: 'https://app.replane.dev' })
 *   const value = client.getConfig('my-config')
 */
export async function createReplaneClient<T extends Configs = Record<string, unknown>>(
  sdkOptions: ReplaneClientOptions<T>
): Promise<ReplaneClient<T>> {
  const storage = new ReplaneRemoteStorage();
  return await _createReplaneClient(toFinalOptions(sdkOptions), storage);
}

/**
 * Create a Replane client that uses in-memory storage.
 * Usage:
 *   const client = createInMemoryReplaneClient({ 'my-config': 123 })
 *   const value = client.getConfig('my-config') // 123
 */
export function createInMemoryReplaneClient<T extends Configs = Record<string, unknown>>(
  initialData: T
): ReplaneClient<T> {
  return {
    getConfig: (configName) => {
      const config = initialData[configName];
      if (config === undefined) {
        throw new ReplaneError({
          message: `Config not found: ${String(configName)}`,
          code: ReplaneErrorCode.NotFound,
        });
      }
      return config;
    },
    close: () => {},
  };
}

async function _createReplaneClient<T extends Configs = Record<string, unknown>>(
  sdkOptions: ReplaneFinalOptions,
  storage: ReplaneStorage
): Promise<ReplaneClient<T>> {
  if (!sdkOptions.sdkKey) throw new Error("SDK key is required");

  let configs: Map<string, ConfigDto> = new Map(
    sdkOptions.fallbacks.map((config) => [config.name, config])
  );

  const clientReady = new Deferred<void>();

  (async () => {
    try {
      const replicationStream = storage.startReplicationStream({
        ...sdkOptions,
        getBody: () => ({
          currentConfigs: [...configs.values()].map((config) => ({
            name: config.name,
            overrides: config.overrides,
            version: config.version,
            value: config.value,
          })),
          requiredConfigs: sdkOptions.requiredConfigs,
        }),
      });

      for await (const event of replicationStream) {
        if (event.type === "init") {
          configs = new Map(event.configs.map((config) => [config.name, config]));

          clientReady.resolve();
        } else if (event.type === "config_change") {
          configs.set(event.configName, {
            name: event.configName,
            overrides: event.overrides,
            version: event.version,
            value: event.value,
          });
        } else {
          warnNever(event, sdkOptions.logger, "Replane: unknown event type in event stream");
        }
      }
    } catch (error) {
      sdkOptions.logger.error("Replane: error initializing client:", error);
      clientReady.reject(error);
    }
  })();

  function getConfig<K extends keyof T>(
    configName: K,
    getConfigOptions: GetConfigOptions = {}
  ): T[K] {
    const config = configs.get(String(configName));

    if (config === undefined) {
      throw new ReplaneError({
        message: `Config not found: ${String(configName)}`,
        code: ReplaneErrorCode.NotFound,
      });
    }

    try {
      return evaluateOverrides<T[K]>(
        config.value as T[K],
        config.overrides,
        { ...sdkOptions.context, ...(getConfigOptions?.context ?? {}) },
        sdkOptions.logger
      );
    } catch (error) {
      sdkOptions.logger.error(
        `Replane: error evaluating overrides for config ${String(configName)}:`,
        error
      );
      return config.value as T[K];
    }
  }

  const close = () => storage.close();

  const initializationTimeoutId = setTimeout(() => {
    if (sdkOptions.fallbacks.length === 0) {
      // no fallbacks, we have nothing to work with
      close();

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
      close();
      clientReady.reject(
        new ReplaneError({
          message: `Required configs are missing: ${missingRequiredConfigs.join(", ")}`,
          code: ReplaneErrorCode.NotFound,
        })
      );

      return;
    }

    clientReady.resolve();
  }, sdkOptions.sdkInitializationTimeoutMs);

  clientReady.promise.then(() => clearTimeout(initializationTimeoutId));

  await clientReady.promise;

  return {
    getConfig,
    close,
  };
}

function toFinalOptions<T extends Configs>(defaults: ReplaneClientOptions<T>): ReplaneFinalOptions {
  return {
    sdkKey: defaults.sdkKey,
    baseUrl: defaults.baseUrl.replace(/\/+$/, ""),
    fetchFn:
      defaults.fetchFn ??
      // some browsers require binding the fetch function to window
      globalThis.fetch.bind(globalThis),
    requestTimeoutMs: defaults.requestTimeoutMs ?? 2000,
    sdkInitializationTimeoutMs: defaults.sdkInitializationTimeoutMs ?? 5000,
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

async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit,
  timeoutMs: number,
  fetchFn: typeof fetch
) {
  if (!fetchFn) {
    throw new Error("Global fetch is not available. Provide options.fetchFn.");
  }
  if (!timeoutMs) return fetchFn(input, init);
  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(), timeoutMs);
  const { signal, cleanUpSignals } = combineAbortSignals([init.signal, timeoutController.signal]);
  try {
    return await fetchFn(input, {
      ...init,
      signal,
    });
  } finally {
    clearTimeout(t);
    cleanUpSignals();
  }
}

const SSE_DATA_PREFIX = "data:";

async function* fetchSse(params: {
  fetchFn: typeof fetch;
  url: string;
  timeoutMs: number;
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  signal?: AbortSignal;
  onConnect?: () => void;
}) {
  const abortController = new AbortController();
  const { signal, cleanUpSignals } = params.signal
    ? combineAbortSignals([params.signal, abortController.signal])
    : { signal: abortController.signal, cleanUpSignals: () => {} };
  try {
    const res = await fetchWithTimeout(
      params.url,
      {
        method: params.method ?? "GET",
        headers: { Accept: "text/event-stream", ...(params.headers ?? {}) },
        body: params.body ? JSON.stringify(params.body) : undefined,
        signal,
      },
      params.timeoutMs,
      params.fetchFn
    );

    await ensureSuccessfulResponse(res, `SSE ${params.url}`);
    const responseContentType = res.headers.get("content-type") ?? "";

    if (!responseContentType.includes("text/event-stream")) {
      throw new ReplaneError({
        message: `Expected text/event-stream, got "${responseContentType}"`,
        code: ReplaneErrorCode.ServerError,
      });
    }

    if (!res.body) {
      throw new ReplaneError({
        message: `Failed to fetch SSE ${params.url}: body is empty`,
        code: ReplaneErrorCode.Unknown,
      });
    }

    if (params.onConnect) {
      params.onConnect();
    }

    const decoded = res.body.pipeThrough(new TextDecoderStream());
    const reader = decoded.getReader();

    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value!;

        // Split on blank line; handle both \n\n and \r\n\r\n
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          // Parse lines inside a single SSE event frame
          const dataLines: string[] = [];

          for (const rawLine of frame.split(/\r?\n/)) {
            if (!rawLine) continue;
            if (rawLine.startsWith(":")) continue; // comment/keepalive

            if (rawLine.startsWith(SSE_DATA_PREFIX)) {
              // Keep leading space after "data:" if present per spec
              const line = rawLine.slice(SSE_DATA_PREFIX.length).replace(/^\s/, "");
              dataLines.push(line);
            }
          }

          if (dataLines.length) {
            const payload = dataLines.join("\n");
            yield payload;
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // ignore error
      }
      abortController.abort();
    }
  } finally {
    cleanUpSignals();
  }
}

async function ensureSuccessfulResponse(response: Response, message: string) {
  if (response.status === 404) {
    throw new ReplaneError({
      message: `Not found: ${message}`,
      code: ReplaneErrorCode.NotFound,
    });
  }

  if (response.status === 401) {
    throw new ReplaneError({
      message: `Unauthorized access: ${message}`,
      code: ReplaneErrorCode.AuthError,
    });
  }

  if (response.status === 403) {
    throw new ReplaneError({
      message: `Forbidden access: ${message}`,
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
      message: `Fetch response isn't successful (${message}): ${response.status} ${response.statusText} - ${body}`,
      code,
    });
  }
}

function combineAbortSignals(signals: Array<AbortSignal | undefined | null>) {
  const controller = new AbortController();
  const onAbort = () => {
    controller.abort();
    cleanUpSignals();
  };

  const cleanUpSignals = () => {
    for (const s of signals) {
      s?.removeEventListener("abort", onAbort);
    }
  };

  for (const s of signals) {
    s?.addEventListener("abort", onAbort, { once: true });
  }

  if (signals.some((s) => s?.aborted)) {
    onAbort();
  }

  return { signal: controller.signal, cleanUpSignals };
}

class Deferred<T> {
  public readonly promise: Promise<T>;
  public resolve!: (value: T) => void;
  public reject!: (error: unknown) => void;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
