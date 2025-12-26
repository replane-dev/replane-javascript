import type { Replane, ReplaneOptions, ConnectOptions } from "@replanejs/sdk";
import type { ReactNode } from "react";

export type UntypedReplaneConfig = Record<string, unknown>;

export interface ReplaneContextValue<T extends object = UntypedReplaneConfig> {
  replane: Replane<T>;
}

/**
 * Props for ReplaneProvider when using a pre-created client.
 */
export interface ReplaneProviderWithClientProps<T extends object = UntypedReplaneConfig> {
  /** Pre-created Replane client instance */
  client: Replane<T>;
  children: ReactNode;
}

/**
 * Props for ReplaneProvider when letting it manage the client internally.
 */
export interface ReplaneProviderWithOptionsProps<
  T extends object = UntypedReplaneConfig,
> extends ReplaneOptions<T> {
  children: ReactNode;
  /**
   * Connection options for connecting to the Replane server.
   * Pass null to explicitly skip connection (client will use defaults/snapshot only).
   */
  connection: ConnectOptions | null;
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
  /**
   * If true, the client will be connected asynchronously. Make sure to provide defaults or snapshot.
   * @default false
   */
  async?: boolean;
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
  return "client" in props && !!props.client;
}

/**
 * Type guard to check if props contain options (with or without snapshot).
 */
export function hasOptions<T extends object>(
  props: ReplaneProviderProps<T>
): props is ReplaneProviderWithOptionsProps<T> {
  return !hasClient(props);
}
