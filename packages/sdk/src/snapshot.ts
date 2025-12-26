import { Replane } from "./client";
import type { ConnectOptions, ReplaneLogger, ReplaneContext, ReplaneSnapshot } from "./client-types";

/**
 * Options for getReplaneSnapshot with caching support.
 */
export interface GetReplaneSnapshotOptions<T extends object> extends ConnectOptions {
  /**
   * Cache TTL in milliseconds. When set, the client is cached and reused
   * for instant subsequent calls within this duration.
   * @default 60_000 (1 minute)
   */
  keepAliveMs?: number;
  /**
   * Optional logger (defaults to console).
   */
  logger?: ReplaneLogger;
  /**
   * Default context for all config evaluations.
   */
  context?: ReplaneContext;
  /**
   * Default values to use if the initial request to fetch configs fails or times out.
   */
  defaults?: {
    [K in keyof T]?: T[K];
  };
}

interface CachedClient {
  client: Replane<object>;
  timeoutId: TimeoutId;
}

interface PendingConnection {
  promise: Promise<Replane<object>>;
}

const clientCache = new Map<string, CachedClient>();
const pendingConnections = new Map<string, PendingConnection>();

function getCacheKey(options: ConnectOptions): string {
  return `${options.baseUrl}:${options.sdkKey}`;
}

type TimeoutId = ReturnType<typeof setTimeout>;

function setupCleanupTimeout(cacheKey: string, keepAliveMs: number): TimeoutId {
  return setTimeout(() => {
    const cached = clientCache.get(cacheKey);
    if (cached) {
      cached.client.disconnect();
      clientCache.delete(cacheKey);
    }
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
  const { keepAliveMs = 60_000, logger, context, defaults, ...connectOptions } = options;

  const cacheKey = getCacheKey(connectOptions);
  const cached = clientCache.get(cacheKey);

  // Return from cache if valid
  if (cached) {
    clearTimeout(cached.timeoutId);
    cached.timeoutId = setupCleanupTimeout(cacheKey, keepAliveMs);
    return cached.client.getSnapshot() as ReplaneSnapshot<T>;
  }

  // Check for pending connection (for concurrent requests)
  const pending = pendingConnections.get(cacheKey);
  if (pending) {
    const client = await pending.promise;
    return client.getSnapshot() as ReplaneSnapshot<T>;
  }

  // Create new client and connect
  const client = new Replane<T>({
    logger,
    context,
    defaults,
  });

  // Store pending connection promise
  const connectionPromise = client.connect(connectOptions).then(() => client as unknown as Replane<object>);
  pendingConnections.set(cacheKey, { promise: connectionPromise });

  try {
    await connectionPromise;

    // Cache the connected client
    const entry: CachedClient = {
      client: client as unknown as Replane<object>,
      timeoutId: setupCleanupTimeout(cacheKey, keepAliveMs),
    };
    clientCache.set(cacheKey, entry);

    return client.getSnapshot();
  } finally {
    pendingConnections.delete(cacheKey);
  }
}

/**
 * Clears the client cache used by getReplaneSnapshot.
 * Useful for testing or when you need to force re-initialization.
 */
export function clearSnapshotCache(): void {
  for (const cached of clientCache.values()) {
    clearTimeout(cached.timeoutId);
    cached.client.disconnect();
  }
  clientCache.clear();
  pendingConnections.clear();
}
