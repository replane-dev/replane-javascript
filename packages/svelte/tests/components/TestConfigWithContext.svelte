<script lang="ts">
  import type { ReplaneClient } from "@replanejs/sdk";
  import { setReplaneContext } from "../../src/context";
  import { useConfig } from "../../src/stores";

  interface Props {
    client: ReplaneClient<any>;
    configName: string;
    context: Record<string, string | number | boolean | null>;
  }

  let { client, configName, context }: Props = $props();

  // Set context (simulating what ReplaneProvider does)
  setReplaneContext(client);

  // Create store with context at top level
  const valueStore = useConfig(configName, { context });
</script>

<div data-testid="value">{String($valueStore)}</div>
