<script lang="ts">
  import type { ReplaneClient } from "@replanejs/sdk";
  import { setReplaneContext } from "../../src/context";
  import { getReplane } from "../../src/stores";

  interface Props {
    client: ReplaneClient<any>;
  }

  let { client }: Props = $props();

  // Set context (simulating what ReplaneContext does)
  // svelte-ignore state_referenced_locally
  setReplaneContext(client);

  // Get replane client to verify it works
  const replane = getReplane();
  const hasClient = replane ? "true" : "false";
</script>

<div data-testid="has-client">{hasClient}</div>
