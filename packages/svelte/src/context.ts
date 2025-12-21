import { getContext, setContext } from "svelte";
import type { ReplaneClient } from "@replanejs/sdk";
import type { ReplaneContextValue } from "./types";

const REPLANE_CONTEXT_KEY = Symbol("replane");

/**
 * Set the Replane client in Svelte context.
 * @internal
 */
export function setReplaneContext<T extends Record<string, unknown>>(client: ReplaneClient<T>): void {
  const value: ReplaneContextValue<T> = { client };
  setContext(REPLANE_CONTEXT_KEY, value);
}

/**
 * Get the Replane context from Svelte context.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getReplaneContext<T extends Record<string, unknown> = any>(): ReplaneContextValue<T> {
  const context = getContext<ReplaneContextValue<T> | undefined>(REPLANE_CONTEXT_KEY);
  if (!context) {
    throw new Error("getReplane() must be used within a ReplaneProvider");
  }
  return context;
}

/**
 * Check if Replane context is available.
 * @internal
 */
export function hasReplaneContext(): boolean {
  try {
    const context = getContext<ReplaneContextValue | undefined>(REPLANE_CONTEXT_KEY);
    return context !== undefined;
  } catch {
    return false;
  }
}
