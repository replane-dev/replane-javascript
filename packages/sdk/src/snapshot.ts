import { createReplaneClient } from "./client";
import type { ReplaneClient, ReplaneClientOptions, ReplaneSnapshot } from "./client-types";

/**
 * Extended options for getReplaneSnapshot with caching support.
 */
export interface GetReplaneSnapshotOptions<T extends object> extends ReplaneClientOptions<T> {
  /**
   * Cache TTL in milliseconds. When set, the client is cached and reused
   * for instant subsequent calls within this duration.
   * @default 60_000 (1 minute)
   */
  keepAliveMs?: number;
}

interface CachedClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientPromise: Promise<ReplaneClient<any>>;
  timeoutId: TimeoutId;
}

const clientCache = new Map<string, CachedClient>();

function getCacheKey<T extends object>(options: ReplaneClientOptions<T>): string {
  return `${options.baseUrl}:${options.sdkKey}`;
}

type TimeoutId = ReturnType<typeof setTimeout>;

function setupCleanupTimeout(cacheKey: string, keepAliveMs: number): TimeoutId {
  return setTimeout(() => {
    clientCache.delete(cacheKey);
  }, keepAliveMs);
}

/**
 * Creates a Replane client and returns a snapshot.
 * Useful for SSR/SSG scenarios where you need to fetch config once
 * and pass it to the client.
 *
 * @example
 * ```ts
 * const snapshot = await getReplaneSnapshot({
 *   baseUrl: process.env.REPLANE_BASE_URL!,
 *   sdkKey: process.env.REPLANE_SDK_KEY!,
 * });
 * ```
 */
export async function getReplaneSnapshot<T extends object>(
  options: GetReplaneSnapshotOptions<T>
): Promise<ReplaneSnapshot<T>> {
  const { keepAliveMs = 60_000, ...clientOptions } = options;

  const cacheKey = getCacheKey(clientOptions);
  const cached = clientCache.get(cacheKey);

  // Return from cache if valid
  if (cached) {
    clearTimeout(cached.timeoutId);
    cached.timeoutId = setupCleanupTimeout(cacheKey, keepAliveMs);

    const client = await cached.clientPromise;
    return client.getSnapshot() as ReplaneSnapshot<T>;
  }

  // Create new client and cache it
  const clientPromise = createReplaneClient<T>(clientOptions);
  const entry: CachedClient = {
    clientPromise: clientPromise,
    timeoutId: setupCleanupTimeout(cacheKey, keepAliveMs),
  };
  clientCache.set(cacheKey, entry);

  const client = await clientPromise;

  return client.getSnapshot();
}

/**
 * Clears the client cache used by getReplaneSnapshot.
 * Useful for testing or when you need to force re-initialization.
 */
export async function clearSnapshotCache(): Promise<void> {
  const clientPromises = [...clientCache.values()].map((cached) => cached.clientPromise);
  clientCache.clear();
  for (const clientPromise of clientPromises) {
    const client = await clientPromise;
    client.close();
  }
}
