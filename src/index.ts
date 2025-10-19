const PROJECT_EVENT_TYPES = ["created", "updated", "deleted"] as const;

interface ProjectEvent {
  type: (typeof PROJECT_EVENT_TYPES)[number];
  configId: string;
}

interface GetProjectEventsReplaneStorageOptions extends ReplaneFinalOptions {
  signal?: AbortSignal;
}

interface GetConfigValueReplaneStorageOptions extends ReplaneFinalOptions {
  configName: string;
  signal?: AbortSignal;
}

interface ReplaneStorage {
  getProjectEvents(
    options: GetProjectEventsReplaneStorageOptions
  ): AsyncIterable<ProjectEvent>;
  getConfigValue<T>(options: GetConfigValueReplaneStorageOptions): Promise<T>;
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
  try {
    return await fetchFn(input, {
      ...init,
      signal: combineAbortSignals([init.signal, timeoutController.signal]),
    });
  } finally {
    clearTimeout(t);
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
  }
): Promise<T> {
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < options.retries && options.isRetryable(e)) {
        await retryDelay(options.delayMs);
        options.logger.warn(
          `${options.name}: attempt ${attempt + 1} failed: ${e}. Retrying in ~${
            options.delayMs
          }ms...`
        );
        continue;
      }
      throw e;
    }
  }
  throw new Error("Unreachable");
}

class ReplaneRemoteStorage implements ReplaneStorage {
  private closeController = new AbortController();

  async *getProjectEvents(
    options: GetProjectEventsReplaneStorageOptions
  ): AsyncIterable<ProjectEvent> {
    const signal = combineAbortSignals([
      this.closeController.signal,
      options.signal,
    ]);
    while (!signal.aborted) {
      try {
        for await (const event of this.getProjectEventsInternal({
          ...options,
          signal,
        })) {
          yield event;
        }
      } catch (error: unknown) {
        if (!signal.aborted) {
          options.logger.error(
            `Failed to fetch project events, retrying in ${options.retryDelayMs}:`,
            error
          );

          await retryDelay(options.retryDelayMs);
        }
      }
    }
  }

  private async *getProjectEventsInternal(
    options: GetProjectEventsReplaneStorageOptions
  ): AsyncIterable<ProjectEvent> {
    const signal = combineAbortSignals([
      this.closeController.signal,
      options.signal,
    ]);
    const rawEvents = fetchSse({
      fetchFn: options.fetchFn,
      headers: {
        Authorization: this.getAuthHeader(options),
      },
      method: "GET",
      signal,
      url: this.getApiEndpoint("/v1/events", options),
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

  async getConfigValue<T>(
    options: GetConfigValueReplaneStorageOptions
  ): Promise<T> {
    return await retry(
      async () => {
        try {
          const url = this.getApiEndpoint(
            `/v1/configs/${encodeURIComponent(options.configName)}/value`,
            options
          );
          const response = await fetchWithTimeout(
            url,
            {
              method: "GET",
              headers: {
                Authorization: this.getAuthHeader(options),
                Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
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

          return (await response.json()) as T;
        } catch (e) {
          if (e instanceof ReplaneError) {
            throw e;
          }
          throw new ReplaneError({
            message: `Network error fetching config "${options.configName}": ${e}`,
            code: ReplaneErrorCode.NetworkError,
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
    const signal = combineAbortSignals([
      options.signal,
      this.closeController.signal,
    ]);

    signal.onabort = () => {
      reject(new Error("getProjectEvents abort requested"));
    };

    let reject: (err: unknown) => void;

    // nothing ever happens in the in memory storage
    await new Promise((_resolve, promiseReject) => {
      reject = promiseReject;
    });
  }

  async getConfigValue<T>(
    options: GetConfigValueReplaneStorageOptions
  ): Promise<T> {
    if (!this.store.has(options.configName)) {
      throw new ReplaneError({
        message: `Config not found: ${options.configName}`,
        code: ReplaneErrorCode.NotFound,
      });
    }
    return this.store.get(options.configName) as T;
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

export interface GetConfigOptions extends Partial<ReplaneClientOptions> {}

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
    options?: GetConfigOptions
  ): Promise<T | undefined>;
  /** Watch a config value by name. */
  watchConfigValue<T = unknown>(
    configName: string,
    options?: GetConfigOptions
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

  const events = Subject.fromAsyncIterable(
    storage.getProjectEvents(combineOptions(sdkOptions, {}))
  );

  async function getConfigValue<T = unknown>(
    configName: string,
    inputOptions: GetConfigOptions = {}
  ): Promise<T> {
    return await storage.getConfigValue<T>({
      configName,
      ...combineOptions(
        sdkOptions,
        inputOptions as Partial<ReplaneClientOptions>
      ),
    });
  }

  const watchers = new Set<ConfigValueWatcher<any>>();

  async function watchConfigValue<T = unknown>(
    configName: string,
    originalOptions: GetConfigOptions = {}
  ): Promise<ConfigValueWatcher<T>> {
    const options = combineOptions(sdkOptions, originalOptions);
    let currentWatcherValue: T = await storage.getConfigValue<T>({
      ...options,
      configName,
    });
    let isWatcherClosed = false;

    const updater = new Debouncer({
      name: "ReplaneConfigWatcherDebouncer",
      onError: (err) => {
        options.logger.error(`ReplaneConfigWatcherWorker error: ${err}`);
      },
      task: async () => {
        const newValue = await storage.getConfigValue<T>({
          ...options,
          configName,
        });
        currentWatcherValue = newValue;
      },
    });

    const intervalId = setInterval(async () => updater.run(), 60_000);
    const unsubscribeFromEvents = events.subscribe({
      next: (event) => {
        if (event.configId !== configName) return;
        updater.run();
      },
      complete: () => {
        // nothing to do
      },
      throw: (err) => {
        options.logger.error(
          `ReplaneConfigWatcherWorker event stream error: ${err}`
        );
      },
    });

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
        unsubscribeFromEvents();
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

const SSE_DATA_PREFIX = "data:";

async function* fetchSse(params: {
  fetchFn: typeof fetch;
  url: string;
  headers?: Record<string, string>;
  method?: string;
  signal?: AbortSignal;
}) {
  const abortController = new AbortController();
  const signal = params.signal
    ? combineAbortSignals([params.signal, abortController.signal])
    : abortController.signal;

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
    abortController.abort();
    try {
      await reader.cancel();
    } catch {}
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
    for (const s of signals) {
      s?.removeEventListener("abort", onAbort);
    }
  };
  for (const s of signals) {
    s?.addEventListener("abort", onAbort);
  }

  if (signals.some((s) => s?.aborted)) {
    onAbort();
  }

  return controller.signal;
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
