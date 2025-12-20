<script lang="ts" module>
  import type { ReplaneClient } from "@replanejs/sdk";
  import type { Snippet } from "svelte";

  export interface ReplaneProviderProps {
    /** Pre-created ReplaneClient instance */
    client: ReplaneClient<any>;
    /** Children snippet */
    children: Snippet;
  }
</script>

<script lang="ts">
  import { setReplaneContext } from "./context";

  let { client, children }: ReplaneProviderProps = $props();

  // Set the client in context
  setReplaneContext(client);
</script>

{@render children()}
