import type {
  Replane,
  ReplaneSnapshot,
  ReplaneContext as ReplaneContextType,
  ReplaneLogger,
  ConnectOptions,
} from "@replanejs/sdk";
import type { Snippet } from "svelte";

/**
 * Context value containing the Replane client
 */
export interface ReplaneContextValue<T extends object = Record<string, unknown>> {
  client: Replane<T>;
}

/**
 * Props for ReplaneContext when using a pre-created client.
 */
export interface ReplaneContextWithClientProps<T extends object = Record<string, unknown>> {
  /** Pre-created Replane client instance */
  client: Replane<T>;
  /** Children snippet */
  children: Snippet;
}

/**
 * Props for ReplaneContext when letting it manage the client internally.
 */
export interface ReplaneContextWithOptionsProps<T extends object = Record<string, unknown>> {
  /** Children snippet */
  children: Snippet;
  /**
   * Connection options for connecting to the Replane server.
   * Pass null to explicitly skip connection (client will use defaults/snapshot only).
   */
  connection: ConnectOptions | null;
  /**
   * Default context for all config evaluations.
   */
  context?: ReplaneContextType;
  /**
   * Optional logger (defaults to console).
   */
  logger?: ReplaneLogger;
  /**
   * Default values to use before connection is established.
   */
  defaults?: { [K in keyof T]?: T[K] };
  /**
   * Optional snapshot from server-side rendering.
   * When provided, the client will be restored from the snapshot synchronously
   * instead of fetching configs from the server.
   */
  snapshot?: ReplaneSnapshot<T>;
  /**
   * Optional loading snippet to show while the client is initializing.
   * If not provided, children will not render until ready.
   * Ignored when snapshot is provided (restoration is synchronous).
   */
  loader?: Snippet;
  /**
   * If true, the client will be connected asynchronously.
   * Make sure to provide defaults or snapshot.
   * @default false
   */
  async?: boolean;
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
