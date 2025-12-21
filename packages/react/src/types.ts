import type {
  ReplaneClient,
  ReplaneClientOptions,
  ReplaneSnapshot,
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
  /** Options to create or restore the ReplaneClient */
  options: ReplaneClientOptions<T>;
  children: ReactNode;
  /**
   * Optional snapshot from server-side rendering.
   * When provided, the client will be restored from the snapshot synchronously
   * instead of fetching configs from the server.
   * The `options` will be used for live updates connection if provided.
   */
  snapshot?: ReplaneSnapshot<T>;
  /**
   * Optional loading component to show while the client is initializing.
   * If not provided and suspense is false/undefined, children will not render until ready.
   * Ignored when snapshot is provided (restoration is synchronous).
   */
  loader?: ReactNode;
  /**
   * If true, uses React Suspense for loading state.
   * The provider will throw a promise that Suspense can catch.
   * Ignored when snapshot is provided (restoration is synchronous).
   * @default false
   */
  suspense?: boolean;
}

export type ReplaneProviderProps<T extends object = UntypedReplaneConfig> =
  | ReplaneProviderWithClientProps<T>
  | ReplaneProviderWithOptionsProps<T>;

/**
 * Type guard to check if props contain a pre-created client.
 */
export function hasClient<T extends object>(
  props: ReplaneProviderProps<T>
): props is ReplaneProviderWithClientProps<T> {
  return "client" in props && props.client !== undefined;
}

/**
 * Type guard to check if props contain options (with or without snapshot).
 */
export function hasOptions<T extends object>(
  props: ReplaneProviderProps<T>
): props is ReplaneProviderWithOptionsProps<T> {
  return "options" in props && props.options !== undefined;
}
