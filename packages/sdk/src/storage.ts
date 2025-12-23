import type { ReplicationStreamRecord, StartReplicationStreamBody } from "./types";
import type { ReplaneFinalOptions } from "./client-types";
import { fetchSse } from "./sse";
import { combineAbortSignals, retryDelay } from "./utils";

const SUPPORTED_REPLICATION_STREAM_RECORD_TYPES = Object.keys({
  config_change: true,
  init: true,
} satisfies Record<ReplicationStreamRecord["type"], true>);

/**
 * Options for starting a replication stream
 */
export interface StartReplicationStreamOptions extends ReplaneFinalOptions {
  // getBody is a function to get the latest configs when we are trying
  // to reestablish the replication stream
  getBody: () => StartReplicationStreamBody;
  signal?: AbortSignal;
  onConnect?: () => void;
}

/**
 * Interface for storage implementations
 */
export interface ReplaneStorage {
  startReplicationStream(
    options: StartReplicationStreamOptions
  ): AsyncIterable<ReplicationStreamRecord>;
  close(): void;
}

/**
 * Remote storage implementation that connects to the Replane server
 * and streams config updates via SSE.
 */
export class ReplaneRemoteStorage implements ReplaneStorage {
  private closeController = new AbortController();

  /**
   * Start a replication stream that yields config updates.
   * This method never throws - it retries on failure with exponential backoff.
   */
  async *startReplicationStream(
    options: StartReplicationStreamOptions
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
    options: StartReplicationStreamOptions
  ): AsyncIterable<ReplicationStreamRecord> {
    // Create an abort controller for inactivity timeout
    const inactivityAbortController = new AbortController();
    const { signal: combinedSignal, cleanUpSignals } = options.signal
      ? combineAbortSignals([options.signal, inactivityAbortController.signal])
      : { signal: inactivityAbortController.signal, cleanUpSignals: () => {} };

    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        inactivityAbortController.abort();
      }, options.inactivityTimeoutMs);
    };

    try {
      const rawEvents = fetchSse({
        fetchFn: options.fetchFn,
        headers: {
          Authorization: this.getAuthHeader(options),
          "Content-Type": "application/json",
          "User-Agent": options.agent,
        },
        body: JSON.stringify(options.getBody()),
        timeoutMs: options.requestTimeoutMs,
        method: "POST",
        signal: combinedSignal,
        url: this.getApiEndpoint(`/sdk/v1/replication/stream`, options),
        onConnect: () => {
          resetInactivityTimer();
          options.onConnect?.();
        },
      });

      for await (const sseEvent of rawEvents) {
        resetInactivityTimer();

        if (sseEvent.type === "comment") continue;

        const event = JSON.parse(sseEvent.data);
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
    } finally {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      cleanUpSignals();
    }
  }

  /**
   * Close the storage and abort any active connections
   */
  close(): void {
    this.closeController.abort();
  }

  private getAuthHeader(options: ReplaneFinalOptions): string {
    return `Bearer ${options.sdkKey}`;
  }

  private getApiEndpoint(path: string, options: ReplaneFinalOptions): string {
    return `${options.baseUrl}/api${path}`;
  }
}
