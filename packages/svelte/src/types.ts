import type { ReplaneClient, ReplaneClientOptions, ReplaneSnapshot } from "@replanejs/sdk";
import type { Snippet } from "svelte";

/**
 * Context value containing the Replane client
 */
export interface ReplaneContextValue<T extends object = Record<string, unknown>> {
  client: ReplaneClient<T>;
}

/**
 * Props for ReplaneContext when using a pre-created client.
 */
export interface ReplaneContextWithClientProps<T extends object = Record<string, unknown>> {
  /** Pre-created ReplaneClient instance */
  client: ReplaneClient<T>;
  /** Children snippet */
  children: Snippet;
}

/**
 * Props for ReplaneContext when letting it manage the client internally.
 */
export interface ReplaneContextWithOptionsProps<T extends object = Record<string, unknown>> {
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

export type ReplaneContextProps<T extends object = Record<string, unknown>> =
  | ReplaneContextWithClientProps<T>
  | ReplaneContextWithOptionsProps<T>;

/**
 * Type guard to check if props contain a pre-created client.
 */
export function hasClient<T extends object>(
  props: ReplaneContextProps<T>
): props is ReplaneContextWithClientProps<T> {
  return "client" in props && props.client !== undefined;
}

/**
 * Type guard to check if props contain options (with or without snapshot).
 */
export function hasOptions<T extends object>(
  props: ReplaneContextProps<T>
): props is ReplaneContextWithOptionsProps<T> {
  return "options" in props && props.options !== undefined;
}
