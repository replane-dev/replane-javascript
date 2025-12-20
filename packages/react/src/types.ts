import type { ReplaneClient, ReplaneClientOptions } from "@replanejs/sdk";
import type { ReactNode } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneContextValue<T extends Record<string, unknown> = any> {
  client: ReplaneClient<T>;
}

/**
 * Props for ReplaneProvider when using a pre-created client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneProviderWithClientProps<T extends Record<string, unknown> = any> {
  /** Pre-created ReplaneClient instance */
  client: ReplaneClient<T>;
  children: ReactNode;
}

/**
 * Props for ReplaneProvider when letting it manage the client internally.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReplaneProviderWithOptionsProps<T extends Record<string, unknown> = any> {
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
  /**
   * Callback when client initialization fails.
   */
  onError?: (error: Error) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReplaneProviderProps<T extends Record<string, unknown> = any> =
  | ReplaneProviderWithClientProps<T>
  | ReplaneProviderWithOptionsProps<T>;

/**
 * Type guard to check if props contain a pre-created client.
 */
export function hasClient<T extends Record<string, unknown>>(
  props: ReplaneProviderProps<T>
): props is ReplaneProviderWithClientProps<T> {
  return "client" in props && props.client !== undefined;
}
