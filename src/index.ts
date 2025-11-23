const PROJECT_EVENT_TYPES = ["created", "updated", "deleted"] as const;

interface ProjectEvent {
  type: (typeof PROJECT_EVENT_TYPES)[number];
  configId: string;
  configName: string;
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
  percentage: number;
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
  context: ReplaneContext
): T {
  // Find first matching override
  for (const override of overrides) {
    // All conditions must match (implicit AND)
    let overrideResult: EvaluationResult = "matched";
    const results = override.conditions.map((c) =>
      evaluateCondition(c, context)
    );
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
  context: ReplaneContext
): EvaluationResult {
  const operator = condition.operator;

  // Composite conditions
  if (operator === "and") {
    const results = condition.conditions.map((c) =>
      evaluateCondition(c, context)
    );
    // AND: false > unknown > true
    if (results.some((r) => r === "not_matched")) return "not_matched";
    if (results.some((r) => r === "unknown")) return "unknown";
    return "matched";
  }

  if (operator === "or") {
    const results = condition.conditions.map((c) =>
      evaluateCondition(c, context)
    );
    // OR: true > unknown > false
    if (results.some((r) => r === "matched")) return "matched";
    if (results.some((r) => r === "unknown")) return "unknown";
    return "not_matched";
  }

  if (operator === "not") {
    const result = evaluateCondition(condition.condition, context);
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

    // Simple hash function
    const hashInput = String(contextValue) + condition.seed;
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      hash = ((hash << 5) - hash + hashInput.charCodeAt(i)) | 0;
    }
    const bucket = Math.abs(hash) % 100;
    return bucket < condition.percentage ? "matched" : "not_matched";
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
      return Array.isArray(castedValue) && castedValue.includes(contextValue)
        ? "matched"
        : "not_matched";

    case "not_in":
      return Array.isArray(castedValue) && !castedValue.includes(contextValue)
        ? "matched"
        : "not_matched";

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
      const _: never = operator;
      return "unknown";
  }
}

/**
 * Cast expected value to match context value type
 */
function castToContextType(
  expectedValue: unknown,
  contextValue: unknown
): unknown {
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
    if (
      typeof expectedValue === "number" ||
      typeof expectedValue === "boolean"
    ) {
      return String(expectedValue);
    }
    return expectedValue;
  }

  return expectedValue;
}

interface GetProjectEventsReplaneStorageOptions extends ReplaneFinalOptions {
  signal?: AbortSignal;
  onConnect?: () => void;
}

interface GetConfigReplaneStorageOptions extends ReplaneFinalOptions {
  configName: string;
  signal?: AbortSignal;
}

interface ReplaneStorage {
  getProjectEvents(
    options: GetProjectEventsReplaneStorageOptions
  ): AsyncIterable<ProjectEvent>;
  getConfig<T>(
    options: GetConfigReplaneStorageOptions
  ): Promise<Config<T> | null>;
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
  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(), timeoutMs);
  const { signal, cleanUpSignals } = combineAbortSignals([
    init.signal,
    timeoutController.signal,
  ]);
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
    isRetryable: (e: any) => boolean;
    signal?: AbortSignal;
  }
): Promise<T> {
  for (
    let attempt = 0;
    attempt <= options.retries && !options.signal?.aborted;
    attempt++
  ) {
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

class ReplaneRemoteStorage implements ReplaneStorage {
  private closeController = new AbortController();

  async *getProjectEvents(
    options: GetProjectEventsReplaneStorageOptions
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
          const retryDelayMs = Math.min(
            options.retryDelayMs * 2 ** (failedAttempts - 1),
            10_000
          );
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
    options: GetProjectEventsReplaneStorageOptions
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

  async getConfig<T>(
    options: GetConfigReplaneStorageOptions
  ): Promise<Config<T> | null> {
    return await retry(
      async () => {
        try {
          const url = this.getApiEndpoint(
            `/v1/configs/${encodeURIComponent(options.configName)}`,
            options
          );
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

          await ensureSuccessfulResponse(
            response,
            `Config ${options.configName}`
          );

          return (await response.json()) as Config<T>;
        } catch (e) {
          if (e instanceof ReplaneError) {
            throw e;
          }
          throw new ReplaneError({
            message: `Network error fetching config "${options.configName}": ${e}`,
            code: ReplaneErrorCode.NetworkError,
            cause: e,
          });
        }
      },
      {
        delayMs: options.retryDelayMs,
        retries: options.retries,
        logger: options.logger,
        name: `fetch ${options.configName}`,
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

  private getAuthHeader(options: ReplaneFinalOptions): string {
    return `Bearer ${options.apiKey}`;
  }

  private getApiEndpoint(path: string, options: ReplaneFinalOptions) {
    return `${options.baseUrl}/api${path}`;
  }
}

class ReplaneInMemoryStorage implements ReplaneStorage {
  private store: Map<string, any>;
  private closeController = new AbortController();

  constructor(initialData: Record<string, any>) {
    this.store = new Map(Object.entries(initialData));
  }

  async *getProjectEvents(options: GetProjectEventsReplaneStorageOptions) {
    const { signal, cleanUpSignals } = combineAbortSignals([
      options.signal,
      this.closeController.signal,
    ]);

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

  async getConfig<T>(
    options: GetConfigReplaneStorageOptions
  ): Promise<Config<T> | null> {
    if (!this.store.has(options.configName)) {
      throw new ReplaneError({
        message: `Config not found: ${options.configName}`,
        code: ReplaneErrorCode.NotFound,
      });
    }
    const value = this.store.get(options.configName) as T;
    return {
      name: options.configName,
      value,
      overrides: [],
      version: 1,
    };
  }

  close() {
    this.closeController.abort();
  }
}

export type ReplaneContext = Record<string, unknown>;

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
  /**
   * Default context for all config evaluations.
   * Can be overridden per-request in `client.watchConfig()` and `watcher.getValue()`.
   */
  context?: ReplaneContext;
}

interface ReplaneFinalOptions {
  baseUrl: string;
  fetchFn: typeof fetch;
  timeoutMs: number;
  apiKey: string;
  logger: ReplaneLogger;
  retries: number;
  retryDelayMs: number;
  context: ReplaneContext;
}

export interface ReplaneLogger {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}

export interface WatchConfigOptions {
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

export interface ReplaneClient {
  /** Watch a config by its name. */
  watchConfig<T = unknown>(
    configName: string,
    options?: WatchConfigOptions
  ): Promise<ConfigWatcher<T>>;
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

  const events = Subject.fromAsyncIterable(
    storage.getProjectEvents(combineOptions(sdkOptions, {}))
  );

  const watchers = new Set<ConfigWatcher<any>>();

  async function watchConfig<T = unknown>(
    configName: string,
    originalOptions: WatchConfigOptions = {}
  ): Promise<ConfigWatcher<T>> {
    const options = combineOptions(sdkOptions, originalOptions);

    // Fetch initial value
    const config = await storage.getConfig<T>({
      ...options,
      configName,
    });

    if (!config) {
      throw new ReplaneError({
        message: `Config not found: ${configName}`,
        code: ReplaneErrorCode.NotFound,
      });
    }

    let currentConfig = config;
    let isWatcherClosed = false;

    const updater = new Debouncer({
      name: "ReplaneConfigWatcherDebouncer",
      onError: (err) => {
        options.logger.error(`ReplaneConfigWatcherWorker error: ${err}`);
      },
      task: async () => {
        const config = await storage.getConfig<T>({
          ...options,
          configName,
        });

        if (!config) {
          throw new ReplaneError({
            message: `Config not found: ${configName}`,
            code: ReplaneErrorCode.NotFound,
          });
        }

        currentConfig = config;
      },
    });

    // we periodically refresh the config value in case events are missed
    const intervalId = setInterval(async () => {
      updater.run();
    }, 60_000);
    const unsubscribeFromEvents = events.subscribe({
      next: (event) => {
        if (event.configName !== configName) return;
        updater.run();
      },
      complete: () => {
        // nothing to do
      },
      throw: (err) => {
        options.logger.error(
          "ReplaneConfigWatcherWorker event stream error:",
          err
        );
      },
    });

    const watcher: ConfigWatcher<T> = {
      getValue(context: ReplaneContext = {}) {
        if (isWatcherClosed) {
          throw new Error("Config value watcher is closed");
        }
        return evaluateOverrides<T>(
          currentConfig.value,
          currentConfig.overrides,
          {
            ...options.context,
            ...context,
          }
        );
      },
      close() {
        if (isWatcherClosed) return;
        isWatcherClosed = true;

        clearInterval(intervalId);
        watchers.delete(watcher);
        unsubscribeFromEvents();
        updater.stop();
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
    storage.close();
  }

  return {
    watchConfig: async (name, options) => {
      if (isClientClosed) {
        throw new Error("Replane client is closed");
      }
      return await watchConfig(name, options);
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
          let dataLines: string[] = [];

          for (const rawLine of frame.split(/\r?\n/)) {
            if (!rawLine) continue;
            if (rawLine.startsWith(":")) continue; // comment/keepalive

            if (rawLine.startsWith(SSE_DATA_PREFIX)) {
              // Keep leading space after "data:" if present per spec
              const line = rawLine
                .slice(SSE_DATA_PREFIX.length)
                .replace(/^\s/, "");
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
      } catch {}
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

interface DebouncerOptions {
  name: string;
  task: () => Promise<void>;
  onError: (err: unknown) => void;
}

class Debouncer {
  private stopped = false;
  private running = false;
  private rescheduleRequested = false;

  readonly name: string;

  constructor(private readonly options: DebouncerOptions) {
    this.name = options.name;
  }

  stop() {
    this.stopped = true;
  }

  run() {
    if (this.stopped) {
      throw new Error(`Debouncer ${this.options.name} is stopped`);
    }
    if (this.running) {
      this.rescheduleRequested = true;
      return;
    }
    this.runInternal();
  }

  private async runInternal() {
    if (this.running || this.stopped) {
      return;
    }

    this.running = true;
    this.rescheduleRequested = false;

    try {
      await this.options.task();
    } catch (err) {
      this.options.onError(err);
    } finally {
      this.running = false;
    }

    if (this.rescheduleRequested) {
      this.runInternal();
    }
  }
}
