"use client";

import { useEffect, useRef, useState } from "react";
import { Replane } from "@replanejs/sdk";
import { DEFAULT_AGENT } from "./version";
import type { ReplaneProviderOptions } from "./types";

type ClientState<T extends object> =
  | { status: "loading"; client: null; error: null }
  | { status: "ready"; client: Replane<T>; error: null }
  | { status: "error"; client: null; error: Error };

// Cache for suspense promise tracking
const suspenseCache = new Map<
  string,
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    promise: Promise<Replane<any>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result?: Replane<any>;
    error?: Error;
  }
>();

function getCacheKey<T extends object>(options: ReplaneProviderOptions<T>): string {
  return `${options.baseUrl}:${options.sdkKey}`;
}

/**
 * Creates a Replane client and connects it.
 */
async function createAndConnectClient<T extends object>(
  options: ReplaneProviderOptions<T>
): Promise<Replane<T>> {
  const client = new Replane<T>({
    logger: options.logger,
    context: options.context,
    defaults: options.defaults,
  });

  await client.connect({
    baseUrl: options.baseUrl,
    sdkKey: options.sdkKey,
    connectTimeoutMs: options.connectTimeoutMs,
    retryDelayMs: options.retryDelayMs,
    requestTimeoutMs: options.requestTimeoutMs,
    inactivityTimeoutMs: options.inactivityTimeoutMs,
    fetchFn: options.fetchFn,
    agent: options.agent ?? DEFAULT_AGENT,
  });

  return client;
}

type ErrorConstructor = new (message: string, options?: { cause?: unknown }) => Error;

/**
 * Hook to manage Replane client creation internally.
 * Handles loading state and cleanup.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useReplaneClientInternal<T extends object = any>(
  options: ReplaneProviderOptions<T>
): ClientState<T> {
  const [state, setState] = useState<ClientState<T>>({
    status: "loading",
    client: null,
    error: null,
  });
  const clientRef = useRef<Replane<T> | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    let cancelled = false;

    async function initClient() {
      try {
        const client = await createAndConnectClient<T>(optionsRef.current);
        if (cancelled) {
          client.disconnect();
          return;
        }
        clientRef.current = client;
        setState({ status: "ready", client, error: null });
      } catch (err) {
        if (cancelled) return;
        const error =
          err instanceof Error ? err : new (Error as ErrorConstructor)(String(err), { cause: err });
        setState({ status: "error", client: null, error });
      }
    }

    initClient();

    return () => {
      cancelled = true;
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, []);

  return state;
}

/**
 * Hook for Suspense-based client creation.
 * Throws a promise while loading, throws error on failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useReplaneClientSuspense<T extends object = any>(
  options: ReplaneProviderOptions<T>
): Replane<T> {
  const cacheKey = getCacheKey(options);
  const cached = suspenseCache.get(cacheKey);

  if (cached) {
    if (cached.error) {
      throw cached.error;
    }
    if (cached.result) {
      return cached.result as Replane<T>;
    }
    // Still loading, throw the promise
    throw cached.promise;
  }

  // First time - create the promise
  const promise = createAndConnectClient<T>(options)
    .then((client) => {
      const entry = suspenseCache.get(cacheKey);
      if (entry) {
        entry.result = client;
      }
      return client;
    })
    .catch((err: unknown) => {
      const entry = suspenseCache.get(cacheKey);
      if (entry) {
        entry.error = err instanceof Error ? err : new Error(String(err));
      }
      throw err;
    });

  suspenseCache.set(cacheKey, { promise });
  throw promise;
}

/**
 * Clear the suspense cache for a specific options configuration.
 * Useful for testing or when you need to force re-initialization.
 */
export function clearSuspenseCache<T extends object>(options?: ReplaneProviderOptions<T>): void {
  if (options) {
    suspenseCache.delete(getCacheKey(options));
  } else {
    suspenseCache.clear();
  }
}
