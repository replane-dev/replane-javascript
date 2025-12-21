import type { ReplaneClient, ReplaneClientOptions, ReplaneSnapshot } from "@replanejs/sdk";
import type { Snippet } from "svelte";

/**
 * Context value containing the Replane client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneContextValue<T extends Record<string, unknown> = any> {
  client: ReplaneClient<T>;
}

/**
 * Props for ReplaneContext when using a pre-created client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneContextWithClientProps<T extends Record<string, unknown> = any> {
  /** Pre-created ReplaneClient instance */
  client: ReplaneClient<T>;
  /** Children snippet */
  children: Snippet;
}

/**
 * Props for ReplaneContext when letting it manage the client internally.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneContextWithOptionsProps<T extends Record<string, unknown> = any> {
  /** Options to create or restore the ReplaneClient */
  options: ReplaneClientOptions<T>;
  /** Children snippet */
  children: Snippet;
  /**
   * Optional snapshot from server-side rendering.
   * When provided, the client will be restored from the snapshot synchronously
   * instead of fetching configs from the server.
   * The `options` will be used for live updates connection if provided.
   */
  snapshot?: ReplaneSnapshot<T>;
  /**
   * Optional loading snippet to show while the client is initializing.
   * If not provided, children will not render until ready.
   * Ignored when snapshot is provided (restoration is synchronous).
   */
  loader?: Snippet;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReplaneContextProps<T extends Record<string, unknown> = any> =
  | ReplaneContextWithClientProps<T>
  | ReplaneContextWithOptionsProps<T>;

/**
 * Type guard to check if props contain a pre-created client.
 */
export function hasClient<T extends Record<string, unknown>>(
  props: ReplaneContextProps<T>
): props is ReplaneContextWithClientProps<T> {
  return "client" in props && props.client !== undefined;
}

/**
 * Type guard to check if props contain options (with or without snapshot).
 */
export function hasOptions<T extends Record<string, unknown>>(
  props: ReplaneContextProps<T>
): props is ReplaneContextWithOptionsProps<T> {
  return "options" in props && props.options !== undefined;
}

/**
 * Options for config()
 */
export interface ConfigOptions {
  /**
   * Context for override evaluation (merged with client-level context).
   */
  context?: Record<string, string | number | boolean | null>;
}
