<script lang="ts">
  import type { Replane } from "@replanejs/sdk";
  import { setReplaneContext } from "../../src/context";
  import { config } from "../../src/stores";

  interface Props {
    client: Replane<any>;
  }

  let { client }: Props = $props();

  // Set context (simulating what ReplaneContext does)
  // svelte-ignore state_referenced_locally
  setReplaneContext(client);

  // Create store at top level
  const valueStore = config("nested");
</script>

<div>
  <div>
    <div data-testid="deep">{$valueStore}</div>
  </div>
</div>
