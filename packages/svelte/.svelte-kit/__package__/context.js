import { getContext, setContext } from "svelte";
const REPLANE_CONTEXT_KEY = Symbol("replane");
/**
 * Set the Replane client in Svelte context.
 * @internal
 */
export function setReplaneContext(client) {
    const value = { client };
    setContext(REPLANE_CONTEXT_KEY, value);
}
/**
 * Get the Replane context from Svelte context.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getReplaneContext() {
    const context = getContext(REPLANE_CONTEXT_KEY);
    if (!context) {
        throw new Error("useReplane must be used within a ReplaneProvider");
    }
    return context;
}
/**
 * Check if Replane context is available.
 * @internal
 */
export function hasReplaneContext() {
    try {
        const context = getContext(REPLANE_CONTEXT_KEY);
        return context !== undefined;
    }
    catch {
        return false;
    }
}
