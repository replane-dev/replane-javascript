import type { ReplaneClient, ReplaneClientOptions, ReplaneSnapshot } from "@replanejs/sdk";
import type { Snippet } from "svelte";

/**
 * Context value containing the Replane client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneContextValue<T extends object = any> {
  client: ReplaneClient<T>;
}

/**
 * Props for ReplaneProvider when using a pre-created client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneProviderWithClientProps<T extends object = any> {
  /** Pre-created ReplaneClient instance */
  client: ReplaneClient<T>;
  /** Children snippet */
  children: Snippet;
}

/**
 * Props for ReplaneProvider when letting it manage the client internally.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneProviderWithOptionsProps<T extends object = any> {
  /** Options to create the ReplaneClient */
  options: ReplaneClientOptions<T>;
  /** Children snippet */
  children: Snippet;
  /**
   * Optional loading snippet to show while the client is initializing.
   * If not provided, children will not render until ready.
   */
  loader?: Snippet;
  /**
   * Callback when client initialization fails.
   */
  onError?: (error: Error) => void;
}

/**
 * Props for ReplaneProvider when restoring from a snapshot (SSR/hydration).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneProviderWithSnapshotProps<T extends object = any> {
  /** Snapshot from server-side rendering */
  snapshot: ReplaneSnapshot<T>;
  /** Optional connection options for live updates */
  connection?: {
    baseUrl: string;
    sdkKey: string;
    fetchFn?: typeof fetch;
    requestTimeoutMs?: number;
    retryDelayMs?: number;
    inactivityTimeoutMs?: number;
  };
  /** Children snippet */
  children: Snippet;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReplaneProviderProps<T extends object = any> =
  | ReplaneProviderWithClientProps<T>
  | ReplaneProviderWithOptionsProps<T>
  | ReplaneProviderWithSnapshotProps<T>;

/**
 * Type guard to check if props contain a pre-created client.
 */
export function hasClient<T extends object>(
  props: ReplaneProviderProps<T>
): props is ReplaneProviderWithClientProps<T> {
  return "client" in props && props.client !== undefined;
}

/**
 * Type guard to check if props contain options.
 */
export function hasOptions<T extends object>(
  props: ReplaneProviderProps<T>
): props is ReplaneProviderWithOptionsProps<T> {
  return "options" in props && props.options !== undefined;
}

/**
 * Type guard to check if props contain a snapshot.
 */
export function hasSnapshot<T extends object>(
  props: ReplaneProviderProps<T>
): props is ReplaneProviderWithSnapshotProps<T> {
  return "snapshot" in props && props.snapshot !== undefined;
}

/**
 * Options for useConfig
 */
export interface UseConfigOptions {
  /**
   * Context for override evaluation (merged with client-level context).
   */
  context?: Record<string, string | number | boolean | null>;
}
