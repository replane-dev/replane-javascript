import { useEffect, useRef, useState } from "react";
import { createReplaneClient } from "@replanejs/sdk";
import type { ReplaneClient, ReplaneClientOptions } from "@replanejs/sdk";

type ClientState<T extends object> =
  | { status: "loading"; client: null; error: null }
  | { status: "ready"; client: ReplaneClient<T>; error: null }
  | { status: "error"; client: null; error: Error };

// Cache for suspense promise tracking
const suspenseCache = new  Map<
  string,
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    promise: Promise<ReplaneClient<any>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result?: ReplaneClient<any>;
    error?: Error;
  }
>();

function getCacheKey<T extends object>(options: ReplaneClientOptions<T>): string {
  return `${options.baseUrl}:${options.sdkKey}`;
}

/**
 * Hook to manage ReplaneClient creation internally.
 * Handles loading state and cleanup.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useReplaneClient<T extends object = any>(
  options: ReplaneClientOptions<T>,
  onError?: (error: Error) => void
): ClientState<T> {
  const [state, setState] = useState<ClientState<T>>({
    status: "loading",
    client: null,
    error: null,
  });
  const clientRef = useRef<ReplaneClient<T> | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    let cancelled = false;

    async function initClient() {
      try {
        const client = await createReplaneClient<T>(optionsRef.current);
        if (cancelled) {
          client.close();
          return;
        }
        clientRef.current = client;
        setState({ status: "ready", client, error: null });
      } catch (err) {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: "error", client: null, error });
        onError?.(error);
      }
    }

    initClient();

    return () => {
      cancelled = true;
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }
    };
    // We intentionally only run this effect once on mount
    // Options changes would require remounting the provider
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

/**
 * Hook for Suspense-based client creation.
 * Throws a promise while loading, throws error on failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useReplaneClientSuspense<T extends object = any>(
  options: ReplaneClientOptions<T>
): ReplaneClient<T> {
  const cacheKey = getCacheKey(options);
  const cached = suspenseCache.get(cacheKey);

  if (cached) {
    if (cached.error) {
      throw cached.error;
    }
    if (cached.result) {
      return cached.result as ReplaneClient<T>;
    }
    // Still loading, throw the promise
    throw cached.promise;
  }

  // First time - create the promise
  const promise = createReplaneClient<T>(options)
    .then((client) => {
      const entry = suspenseCache.get(cacheKey);
      if (entry) {
        entry.result = client;
      }
      return client;
    })
    .catch((err) => {
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
export function clearSuspenseCache<T extends object>(options?: ReplaneClientOptions<T>): void {
  if (options) {
    suspenseCache.delete(getCacheKey(options));
  } else {
    suspenseCache.clear();
  }
}
