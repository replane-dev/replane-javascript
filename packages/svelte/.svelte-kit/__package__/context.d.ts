import type { ReplaneClient } from "@replanejs/sdk";
import type { ReplaneContextValue } from "./types";
/**
 * Set the Replane client in Svelte context.
 * @internal
 */
export declare function setReplaneContext<T extends object>(client: ReplaneClient<T>): void;
/**
 * Get the Replane context from Svelte context.
 * @internal
 */
export declare function getReplaneContext<T extends object = any>(): ReplaneContextValue<T>;
/**
 * Check if Replane context is available.
 * @internal
 */
export declare function hasReplaneContext(): boolean;
//# sourceMappingURL=context.d.ts.map