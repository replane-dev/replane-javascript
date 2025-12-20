import type { ReplaneClientOptions } from "@replanejs/sdk";
import type { Snippet } from "svelte";
export interface ReplaneProviderAsyncProps {
    /** Options to create the ReplaneClient */
    options: ReplaneClientOptions<any>;
    /** Children snippet */
    children: Snippet;
    /**
     * Optional loading snippet to show while the client is initializing.
     * If not provided, nothing will render until ready.
     */
    loader?: Snippet;
    /**
     * Callback when client initialization fails.
     */
    onError?: (error: Error) => void;
}
declare const ReplaneProviderAsync: import("svelte").Component<ReplaneProviderAsyncProps, {}, "">;
type ReplaneProviderAsync = ReturnType<typeof ReplaneProviderAsync>;
export default ReplaneProviderAsync;
//# sourceMappingURL=ReplaneProviderAsync.svelte.d.ts.map