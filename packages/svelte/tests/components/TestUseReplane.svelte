<script lang="ts">
  import type { ReplaneClient } from "@replanejs/sdk";
  import { setReplaneContext, getReplaneContext } from "../../src/context";

  interface Props {
    client: ReplaneClient<any>;
  }

  let { client }: Props = $props();

  // Set context (simulating what ReplaneContext does)
  // svelte-ignore state_referenced_locally
  setReplaneContext(client);

  // Get context to verify it works
  const context = getReplaneContext();
  const hasClient = context?.client ? "true" : "false";
</script>

<div data-testid="has-client">{hasClient}</div>
