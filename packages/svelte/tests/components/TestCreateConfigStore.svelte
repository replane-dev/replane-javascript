<script lang="ts">
  import type { ReplaneClient } from "@replanejs/sdk";
  import { createConfigStore } from "../../src/stores";

  interface Props {
    client: ReplaneClient<any>;
    configName: string;
  }

  let { client, configName }: Props = $props();

  // Using createConfigStore directly without provider
  const store = createConfigStore(client, configName);
</script>

<div data-testid="store-value">{String($store)}</div>
