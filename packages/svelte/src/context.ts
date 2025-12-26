import { getContext, setContext } from "svelte";
import type { Replane } from "@replanejs/sdk";
import type { ReplaneContextValue } from "./types";

const REPLANE_CONTEXT_KEY = Symbol("replane");

/**
 * Set the Replane client in Svelte context.
 * @internal
 */
export function setReplaneContext<T extends object>(client: Replane<T>): void {
  const value: ReplaneContextValue<T> = { client };
  setContext(REPLANE_CONTEXT_KEY, value);
}

/**
 * Get the Replane context from Svelte context.
 * @internal
 */
export function getReplaneContext<
  T extends object = Record<string, unknown>,
>(): ReplaneContextValue<T> {
  const context = getContext<ReplaneContextValue<T> | undefined>(REPLANE_CONTEXT_KEY);
  if (!context) {
    throw new Error("getReplane() must be used within a ReplaneContext");
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
