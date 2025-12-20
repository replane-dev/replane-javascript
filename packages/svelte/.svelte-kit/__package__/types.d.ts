import type { ReplaneClient, ReplaneClientOptions, ReplaneSnapshot } from "@replanejs/sdk";
import type { Snippet } from "svelte";
/**
 * Context value containing the Replane client
 */
export interface ReplaneContextValue<T extends object = any> {
    client: ReplaneClient<T>;
}
/**
 * Props for ReplaneProvider when using a pre-created client.
 */
export interface ReplaneProviderWithClientProps<T extends object = any> {
    /** Pre-created ReplaneClient instance */
    client: ReplaneClient<T>;
    /** Children snippet */
    children: Snippet;
}
/**
 * Props for ReplaneProvider when letting it manage the client internally.
 */
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
export type ReplaneProviderProps<T extends object = any> = ReplaneProviderWithClientProps<T> | ReplaneProviderWithOptionsProps<T> | ReplaneProviderWithSnapshotProps<T>;
/**
 * Type guard to check if props contain a pre-created client.
 */
export declare function hasClient<T extends object>(props: ReplaneProviderProps<T>): props is ReplaneProviderWithClientProps<T>;
/**
 * Type guard to check if props contain options.
 */
export declare function hasOptions<T extends object>(props: ReplaneProviderProps<T>): props is ReplaneProviderWithOptionsProps<T>;
/**
 * Type guard to check if props contain a snapshot.
 */
export declare function hasSnapshot<T extends object>(props: ReplaneProviderProps<T>): props is ReplaneProviderWithSnapshotProps<T>;
/**
 * Options for useConfig
 */
export interface UseConfigOptions {
    /**
     * Context for override evaluation (merged with client-level context).
     */
    context?: Record<string, string | number | boolean | null>;
}
//# sourceMappingURL=types.d.ts.map