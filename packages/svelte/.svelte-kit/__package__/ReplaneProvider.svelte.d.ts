import type { ReplaneClient } from "@replanejs/sdk";
import type { Snippet } from "svelte";
export interface ReplaneProviderProps {
    /** Pre-created ReplaneClient instance */
    client: ReplaneClient<any>;
    /** Children snippet */
    children: Snippet;
}
declare const ReplaneProvider: import("svelte").Component<ReplaneProviderProps, {}, "">;
type ReplaneProvider = ReturnType<typeof ReplaneProvider>;
export default ReplaneProvider;
//# sourceMappingURL=ReplaneProvider.svelte.d.ts.map