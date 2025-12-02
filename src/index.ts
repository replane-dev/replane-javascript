const PROJECT_EVENT_TYPES = ["created", "updated", "deleted"] as const;

interface ProjectEvent {
  type: (typeof PROJECT_EVENT_TYPES)[number];
  configId: string;
  configName: string;
  renderedOverrides: RenderedOverride[];
  version: number;
  value: unknown;
}

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

interface PropertyCondition {
  operator:
    | "equals"
    | "in"
    | "not_in"
    | "less_than"
    | "less_than_or_equal"
    | "greater_than"
    | "greater_than_or_equal";
  property: string;
  value: unknown;
}

interface SegmentationCondition {
  operator: "segmentation";
  property: string;
  fromPercentage: number;
  toPercentage: number;
  seed: string;
}

interface AndCondition {
  operator: "and";
  conditions: RenderedCondition[];
}

interface OrCondition {
  operator: "or";
  conditions: RenderedCondition[];
}

interface NotCondition {
  operator: "not";
  condition: RenderedCondition;
}

type RenderedCondition =
  | PropertyCondition
  | SegmentationCondition
  | AndCondition
  | OrCondition
  | NotCondition;

interface RenderedOverride {
  name: string;
  conditions: RenderedCondition[];
  value: unknown;
}

interface Config<T> {
  name: string;
  value: T;
  overrides: RenderedOverride[];
  version: number;
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

interface GetProjectEventsReplaneStorageOptions<T extends Configs> extends ReplaneFinalOptions<T> {
  signal?: AbortSignal;
  onConnect?: () => void;
}

interface GetProjectConfigsReplaneStorageOptions<T extends Configs> extends ReplaneFinalOptions<T> {
  signal?: AbortSignal;
}

type Configs = object;

type InferProjectConfig<T extends Configs> = {
  [K in keyof T]: Config<T[K]>;
}[keyof T];

interface ReplaneStorage<T extends Configs> {
  getProjectEvents(options: GetProjectEventsReplaneStorageOptions<T>): AsyncIterable<ProjectEvent>;
  getProjectConfigs(
    options: GetProjectConfigsReplaneStorageOptions<T>
  ): Promise<Array<InferProjectConfig<T>>>;
  close(): void;
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

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryDelay(averageDelay: number) {
  const jitter = averageDelay / 5;
  const delayMs = averageDelay + Math.random() * jitter - jitter / 2;

  await delay(delayMs);
}

async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries: number;
    delayMs: number;
    logger: ReplaneLogger;
    name: string;
    isRetryable: (e: unknown) => boolean;
    signal?: AbortSignal;
  }
): Promise<T> {
  for (let attempt = 0; attempt <= options.retries && !options.signal?.aborted; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < options.retries && options.isRetryable(e)) {
        options.logger.warn(
          `${options.name}: attempt ${attempt + 1} failed: ${e}. Retrying in ~${
            options.delayMs
          }ms...`
        );
        await retryDelay(options.delayMs);
        continue;
      }
      throw e;
    }
  }

  throw new ReplaneError({
    message: `${options.name}: aborted`,
    code: ReplaneErrorCode.Unknown,
  });
}

class ReplaneRemoteStorage<T extends Configs> implements ReplaneStorage<T> {
  private closeController = new AbortController();

  async *getProjectEvents(
    options: GetProjectEventsReplaneStorageOptions<T>
  ): AsyncIterable<ProjectEvent> {
    const { signal, cleanUpSignals } = combineAbortSignals([
      this.closeController.signal,
      options.signal,
    ]);
    try {
      let failedAttempts = 0;
      while (!signal.aborted) {
        try {
          for await (const event of this.getProjectEventsInternal({
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

  private async *getProjectEventsInternal(
    options: GetProjectEventsReplaneStorageOptions<T>
  ): AsyncIterable<ProjectEvent> {
    const rawEvents = fetchSse({
      fetchFn: options.fetchFn,
      headers: {
        Authorization: this.getAuthHeader(options),
      },
      method: "GET",
      signal: options.signal,
      url: this.getApiEndpoint("/v1/events", options),
      onConnect: options.onConnect,
    });

    for await (const rawEvent of rawEvents) {
      const event = JSON.parse(rawEvent);
      if (
        typeof event === "object" &&
        event !== null &&
        "type" in event &&
        typeof event.type === "string" &&
        (PROJECT_EVENT_TYPES as unknown as string[]).includes(event.type)
      ) {
        yield event as ProjectEvent;
      }
    }
  }

  async getProjectConfigs(
    options: GetProjectConfigsReplaneStorageOptions<T>
  ): Promise<Array<InferProjectConfig<T>>> {
    return await retry(
      async () => {
        try {
          const url = this.getApiEndpoint(`/v1/configs`, options);
          const response = await fetchWithTimeout(
            url,
            {
              method: "GET",
              headers: {
                Authorization: this.getAuthHeader(options),
                Accept: "application/json",
              },
              // we don't combine the signal with this.closeController,
              // because we expect it to finish shortly
              signal: options.signal,
            },
            options.timeoutMs,
            options.fetchFn
          );

          await ensureSuccessfulResponse(response, `Project configs`);

          return ((await response.json()) as { items: Array<InferProjectConfig<T>> }).items;
        } catch (e) {
          if (e instanceof ReplaneError) {
            throw e;
          }
          throw new ReplaneError({
            message: `Network error fetching project configs: ${e}`,
            code: ReplaneErrorCode.NetworkError,
            cause: e,
          });
        }
      },
      {
        delayMs: options.retryDelayMs,
        retries: options.retries,
        logger: options.logger,
        name: `fetch project configs`,
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
        signal: options.signal,
      }
    );
  }

  close() {
    this.closeController.abort();
  }

  private getAuthHeader(options: ReplaneFinalOptions<T>): string {
    return `Bearer ${options.apiKey}`;
  }

  private getApiEndpoint(path: string, options: ReplaneFinalOptions<T>) {
    return `${options.baseUrl}/api${path}`;
  }
}

class ReplaneInMemoryStorage<T extends Configs> implements ReplaneStorage<T> {
  private store: Map<string, unknown>;
  private closeController = new AbortController();

  constructor(initialData: T) {
    this.store = new Map(Object.entries(initialData));
  }

  async *getProjectEvents(options: GetProjectEventsReplaneStorageOptions<T>) {
    const { signal, cleanUpSignals } = combineAbortSignals([
      options.signal,
      this.closeController.signal,
    ]);

    // suppress eslint warning about lack of explicit yield in the async generator
    yield* [];

    try {
      if (signal.aborted) return;

      signal.onabort = () => {
        reject(new Error("getProjectEvents abort requested"));
      };

      let reject: (err: unknown) => void;

      // nothing ever happens in the in memory storage
      await new Promise((_resolve, promiseReject) => {
        reject = promiseReject;
      });
    } finally {
      cleanUpSignals();
    }
  }

  async getProjectConfigs(): Promise<Array<InferProjectConfig<T>>> {
    return Array.from(this.store.entries()).map(([key, value]) => ({
      name: key,
      value: value as T[keyof T],
      overrides: [],
      version: 1,
    }));
  }

  close() {
    this.closeController.abort();
  }
}

export type ReplaneContext = Record<string, unknown>;

export interface ReplaneClientOptions<T extends Configs> {
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
  /**
   * Default context for all config evaluations.
   * Can be overridden per-request in `client.watchConfig()` and `watcher.getValue()`.
   */
  context?: ReplaneContext;

  /**
   * Required configs for the client.
   * If a config is not present, the client will throw an error.
   * @example
   * {
   *   requiredConfigs: {
   *     config1: true,
   *     config2: true,
   *     config3: false,
   *   },
   * }
   */
  requiredConfigs?: {
    [K in keyof T]: boolean;
  };

  /**
   * Fallback configs to use if the initial request to fetch configs fails.
   * Explicit undefined value must be used to indicate that there is no fallback value for this config. This makes sure you don't forget to provide a fallback value for all configs.
   * @example
   * {
   *   fallbackConfigs: {
   *     config1: "value1",
   *     config2: 42,
   *     config3: undefined, // undefined means the is no fallback value for this config
   *   },
   * }
   */
  fallbackConfigs?: {
    [K in keyof T]: T[K] | undefined;
  };
}

interface ReplaneFinalOptions<T extends Configs> {
  baseUrl: string;
  fetchFn: typeof fetch;
  timeoutMs: number;
  apiKey: string;
  logger: ReplaneLogger;
  retries: number;
  retryDelayMs: number;
  context: ReplaneContext;
  requiredConfigs?: {
    [K in keyof T]: boolean;
  };
  fallbackConfigs?: {
    [K in keyof T]: T[K] | undefined;
  };
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
  NetworkError = "network_error",
  AuthError = "auth_error",
  Forbidden = "forbidden",
  ServerError = "server_error",
  ClientError = "client_error",
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
 * Create a Replane client bound to an API key.
 * Usage:
 *   const client = createReplaneClient({ apiKey: 'your-api-key', baseUrl: 'https://app.replane.dev' })
 *   const value = await client.getConfig('my-config')
 */
export async function createReplaneClient<T extends Configs = Record<string, unknown>>(
  sdkOptions: ReplaneClientOptions<T>
): Promise<ReplaneClient<T>> {
  const storage = new ReplaneRemoteStorage<T>();
  return await _createReplaneClient(combineOptions(sdkOptions, {}), storage);
}

/**
 * Create a Replane client that uses in-memory storage.
 * Usage:
 *   const client = createInMemoryReplaneClient({ 'my-config': 123 })
 *   const value = await client.getConfigValue('my-config') // 123
 */
export async function createInMemoryReplaneClient<T extends Configs = Record<string, unknown>>(
  initialData: T
): Promise<ReplaneClient<T>> {
  const storage = new ReplaneInMemoryStorage<T>(initialData);
  return await _createReplaneClient(
    combineOptions({ apiKey: "test-api-key", baseUrl: "https://app.replane.dev" }, {}),
    storage
  );
}

async function _createReplaneClient<T extends Configs = Record<string, unknown>>(
  sdkOptions: ReplaneFinalOptions<T>,
  storage: ReplaneStorage<T>
): Promise<ReplaneClient<T>> {
  if (!sdkOptions.apiKey) throw new Error("API key is required");

  const events = Subject.fromAsyncIterable(
    storage.getProjectEvents(combineOptions<T>(sdkOptions, {}))
  );

  function enrichWithFallbackConfigs(configs: Map<string, InferProjectConfig<T>>) {
    const result = new Map<string, InferProjectConfig<T>>(configs);
    for (const [key, value] of Object.entries(sdkOptions.fallbackConfigs ?? {})) {
      if (value !== undefined) {
        result.set(key, {
          name: key,
          value: value as T[keyof T],
          overrides: [],
          version: -1, // -1 means the config is a fallback config
        });
      }
    }

    return result;
  }

  let configs = await storage
    .getProjectConfigs(combineOptions(sdkOptions, {}))
    .then((configs) => {
      const remoteConfigs = new Map<string, InferProjectConfig<T>>(
        configs.map((config) => [config.name, config])
      );
      return enrichWithFallbackConfigs(remoteConfigs);
    })
    .catch((error) => {
      if (!sdkOptions.fallbackConfigs) {
        throw error;
      }

      return new Map<string, InferProjectConfig<T>>(
        Object.entries(sdkOptions.fallbackConfigs).map(([key, value]) => [
          key,
          {
            name: key,
            value: value as T[keyof T],
            overrides: [],
            version: -1, // -1 means the config is a fallback config
          },
        ])
      );
    });

  const requiredConfigs = new Set(
    Object.entries(sdkOptions.requiredConfigs ?? {})
      .filter(([_, value]) => value)
      .map(([key]) => key)
  );

  function getMissingConfigs(configs: Map<string, InferProjectConfig<T>>) {
    return Array.from(requiredConfigs).filter((configName) => !configs.has(configName));
  }

  const missingConfigs = getMissingConfigs(configs);
  if (missingConfigs.length > 0) {
    throw new ReplaneError({
      message: `Required configs not found: ${missingConfigs.join(", ")}`,
      code: ReplaneErrorCode.NotFound,
    });
  }

  const REFRESH_CONFIGS_INTERVAL_MS = 60_000;

  async function refreshConfigs() {
    try {
      const oldConfigs = configs;
      configs = await storage
        .getProjectConfigs(combineOptions<T>(sdkOptions, {}))
        .then((configs) => new Map(configs.map((config) => [config.name, config])));
      configs = enrichWithFallbackConfigs(configs);

      const missingConfigs = getMissingConfigs(configs);
      if (missingConfigs.length > 0) {
        sdkOptions.logger.warn(
          "Replane: required configs not found, refreshing configs. Missing configs:",
          missingConfigs
        );
      }

      for (const configName of missingConfigs) {
        configs.set(configName, oldConfigs.get(configName)!);
      }
    } catch (error) {
      sdkOptions.logger.error("Replane: error refreshing configs:", error);
    } finally {
      timeoutId = setTimeout(refreshConfigs, REFRESH_CONFIGS_INTERVAL_MS);
    }
  }

  let timeoutId = setTimeout(refreshConfigs, REFRESH_CONFIGS_INTERVAL_MS);

  const unsubscribeFromEvents = events.subscribe({
    next: (event) => {
      if (event.type === "created") {
        configs.set(event.configName, {
          name: event.configName,
          overrides: event.renderedOverrides,
          version: event.version,
          value: event.value as T[keyof T],
        });
      } else if (event.type === "updated") {
        configs.set(event.configName, {
          name: event.configName,
          overrides: event.renderedOverrides,
          version: event.version,
          value: event.value as T[keyof T],
        });
      } else if (event.type === "deleted") {
        if (requiredConfigs.has(event.configName)) {
          sdkOptions.logger.warn(
            "Replane: required config deleted. Deleted config name:",
            event.configName
          );
        } else {
          configs.delete(event.configName);
        }
      } else {
        sdkOptions.logger.warn(
          "Replane: unknown event type in event stream (upgrade the SDK to handle this event type):",
          event
        );
      }
    },
    complete: () => {
      // nothing to do
    },
    throw: (err) => {
      sdkOptions.logger.error("Replane: event stream error:", err);
    },
  });

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

    const options = combineOptions(sdkOptions, getConfigOptions);

    try {
      return evaluateOverrides<T[K]>(
        config.value as T[K],
        config.overrides,
        options.context,
        options.logger
      );
    } catch (error) {
      options.logger.error(
        `Replane: error evaluating overrides for config ${String(configName)}:`,
        error
      );
      return config.value as T[K];
    }
  }

  let isClientClosed = false;

  function close() {
    if (isClientClosed) return;
    isClientClosed = true;

    clearTimeout(timeoutId);
    unsubscribeFromEvents();

    storage.close();
  }

  return {
    getConfig: (configName, getConfigOptions) => {
      if (isClientClosed) {
        throw new Error("Replane client is closed");
      }
      return getConfig(configName, getConfigOptions);
    },
    close,
  };
}

function combineOptions<T extends Configs>(
  defaults: ReplaneClientOptions<T>,
  overrides: Partial<ReplaneClientOptions<T>>
): ReplaneFinalOptions<T> {
  return {
    apiKey: overrides.apiKey ?? defaults.apiKey,
    baseUrl: (overrides.baseUrl ?? defaults.baseUrl).replace(/\/+$/, ""),
    fetchFn:
      overrides.fetchFn ??
      defaults.fetchFn ??
      // some browsers require binding the fetch function to window
      globalThis.fetch.bind(globalThis),
    timeoutMs: overrides.timeoutMs ?? defaults.timeoutMs ?? 2000,
    logger: overrides.logger ?? defaults.logger ?? console,
    retries: overrides.retries ?? defaults.retries ?? 2,
    retryDelayMs: overrides.retryDelayMs ?? defaults.retryDelayMs ?? 200,
    context: {
      ...(defaults.context ?? {}),
      ...(overrides.context ?? {}),
    },
    requiredConfigs: overrides.requiredConfigs ?? defaults.requiredConfigs,
  };
}

const SSE_DATA_PREFIX = "data:";

async function* fetchSse(params: {
  fetchFn: typeof fetch;
  url: string;
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
    const res = await params.fetchFn(params.url, {
      method: params.method ?? "GET",
      headers: { Accept: "text/event-stream", ...(params.headers ?? {}) },
      signal,
    });

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
            // Optionally handle event:, id:, retry: here if you need them
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

interface Observer<T> {
  next: (value: T) => void;
  throw: (error: unknown) => void;
  complete: () => void;
}

type Unsubscribe = () => void;

interface Observable<T> {
  subscribe(observer: Observer<T>): Unsubscribe;
}

class Subject<T> implements Observable<T>, Observer<T> {
  static fromAsyncIterable<T>(asyncIterable: AsyncIterable<T>): Subject<T> {
    const subject = new Subject<T>();

    (async () => {
      try {
        for await (const item of asyncIterable) {
          subject.next(item);
        }
        subject.complete();
      } catch (err) {
        subject.throw(err);
      }
    })();

    return subject;
  }

  private observers: Set<Observer<T>> = new Set();
  private isComplete = false;

  subscribe(observer: Observer<T>): Unsubscribe {
    this.ensureActive();

    // wrap the observer to have a unique reference
    const observerWrapper: Observer<T> = {
      next: (value) => observer.next(value),
      throw: (error) => observer.throw(error),
      complete: () => observer.complete(),
    };

    this.observers.add(observerWrapper);

    return () => {
      this.observers.delete(observerWrapper);
    };
  }

  next(value: T): void {
    this.ensureActive();

    for (const observer of this.observers) {
      observer.next(value);
    }
  }

  throw(error: unknown): void {
    this.ensureActive();

    for (const observer of this.observers) {
      observer.throw(error);
    }
  }

  complete() {
    if (this.isComplete) return;
    this.isComplete = true;

    for (const observer of this.observers) {
      observer.complete();
    }

    this.observers.clear();
  }

  private ensureActive() {
    if (this.isComplete) {
      throw new Error("Subject already completed");
    }
  }
}
