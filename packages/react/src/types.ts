import type {
  ReplaneClient,
  ReplaneClientOptions,
  RestoreReplaneClientOptions,
} from "@replanejs/sdk";
import type { ReactNode } from "react";

export type UntypedReplaneConfig = Record<string, unknown>;

export interface ReplaneContextValue<T extends object = UntypedReplaneConfig> {
  client: ReplaneClient<T>;
}

/**
 * Props for ReplaneProvider when using a pre-created client.
 */
export interface ReplaneProviderWithClientProps<T extends object = UntypedReplaneConfig> {
  /** Pre-created ReplaneClient instance */
  client: ReplaneClient<T>;
  children: ReactNode;
}

/**
 * Props for ReplaneProvider when letting it manage the client internally.
 */
export interface ReplaneProviderWithOptionsProps<T extends object = UntypedReplaneConfig> {
  /** Options to create the ReplaneClient */
  options: ReplaneClientOptions<T>;
  children: ReactNode;
  /**
   * Optional loading component to show while the client is initializing.
   * If not provided and suspense is false/undefined, children will not render until ready.
   */
  loader?: ReactNode;
  /**
   * If true, uses React Suspense for loading state.
   * The provider will throw a promise that Suspense can catch.
   * @default false
   */
  suspense?: boolean;
}

/**
 * Props for ReplaneProvider when restoring from a snapshot.
 * Uses restoreReplaneClient from the SDK for synchronous client creation.
 */
export interface ReplaneProviderWithSnapshotProps<T extends object = UntypedReplaneConfig> {
  /** Options to restore the ReplaneClient from a snapshot */
  restoreOptions: RestoreReplaneClientOptions<T>;
  children: ReactNode;
}

export type ReplaneProviderProps<T extends object = UntypedReplaneConfig> =
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
 * Type guard to check if props contain restore options.
 */
export function hasRestoreOptions<T extends object>(
  props: ReplaneProviderProps<T>
): props is ReplaneProviderWithSnapshotProps<T> {
  return "restoreOptions" in props && props.restoreOptions !== undefined;
}
