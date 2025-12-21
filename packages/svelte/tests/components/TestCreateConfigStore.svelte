<script lang="ts">
  import type { ReplaneClient } from "@replanejs/sdk";
  import { configFrom } from "../../src/stores";

  interface Props {
    client: ReplaneClient<any>;
    configName: string;
  }

  let { client, configName }: Props = $props();

  // Using configFrom directly without provider
  // svelte-ignore state_referenced_locally
  const store = configFrom(client, configName);
</script>

<div data-testid="store-value">{String($store)}</div>
