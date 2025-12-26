<script lang="ts">
  import type { Replane } from "@replanejs/sdk";
  import { setReplaneContext } from "../../src/context";
  import { config } from "../../src/stores";

  interface Props {
    client: Replane<any>;
    configName: string;
    context: Record<string, string | number | boolean | null>;
  }

  let { client, configName, context }: Props = $props();

  // Set context (simulating what ReplaneContext does)
  // svelte-ignore state_referenced_locally
  setReplaneContext(client);

  // Create store with context at top level
  // svelte-ignore state_referenced_locally
  const valueStore = config(configName, { context });
</script>

<div data-testid="value">{String($valueStore)}</div>
