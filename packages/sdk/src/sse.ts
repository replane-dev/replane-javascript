import { ReplaneError, ReplaneErrorCode } from "./error";
import { combineAbortSignals } from "./utils";

const SSE_DATA_PREFIX = "data:";

/**
 * Parsed SSE event
 */
export type SseEvent = { type: "comment"; comment: string } | { type: "data"; data: string };

/**
 * Options for fetchSse
 */
export interface FetchSseOptions {
  fetchFn: typeof fetch;
  url: string;
  timeoutMs: number;
  body?: string;
  headers?: Record<string, string>;
  method?: string;
  signal?: AbortSignal;
  onConnect?: () => void;
}

/**
 * Fetch with timeout support
 */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit,
  timeoutMs: number,
  fetchFn: typeof fetch
): Promise<Response> {
  if (!fetchFn) {
    throw new Error("Global fetch is not available. Provide options.fetchFn.");
  }
  if (!timeoutMs) return fetchFn(input, init);

  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(), timeoutMs);
  // Note: We intentionally don't call cleanUpSignals() here because for streaming
  // responses (like SSE), the connection remains open after the response headers
  // are received. The abort signal needs to remain connected so that close() can
  // propagate the abort through the signal chain.
  const { signal } = combineAbortSignals([init.signal, timeoutController.signal]);
  try {
    return await fetchFn(input, {
      ...init,
      signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ensures the response is successful, throwing ReplaneError if not
 */
export async function ensureSuccessfulResponse(response: Response, message: string): Promise<void> {
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

/**
 * Fetches a Server-Sent Events (SSE) stream and yields parsed events.
 *
 * @param params - Options for the SSE fetch
 * @yields SseEvent objects containing either data or comment events
 */
export async function* fetchSse(params: FetchSseOptions): AsyncGenerator<SseEvent> {
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
        body: params.body,
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
          let comment: string | null = null;

          for (const rawLine of frame.split(/\r?\n/)) {
            if (!rawLine) continue;
            if (rawLine.startsWith(":")) {
              // comment/keepalive
              comment = rawLine.slice(1);
              continue;
            }

            if (rawLine.startsWith(SSE_DATA_PREFIX)) {
              // Keep leading space after "data:" if present per spec
              const line = rawLine.slice(SSE_DATA_PREFIX.length).replace(/^\s/, "");
              dataLines.push(line);
            }
          }

          if (dataLines.length) {
            const data = dataLines.join("\n");
            yield { type: "data", data };
          } else if (comment !== null) {
            yield { type: "comment", comment };
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
