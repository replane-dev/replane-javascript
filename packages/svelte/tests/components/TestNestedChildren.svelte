<script lang="ts">
  import type { ReplaneClient } from "@replanejs/sdk";
  import { setReplaneContext } from "../../src/context";
  import { useConfig } from "../../src/stores";

  interface Props {
    client: ReplaneClient<any>;
  }

  let { client }: Props = $props();

  // Set context (simulating what ReplaneProvider does)
  setReplaneContext(client);

  // Create store at top level
  const valueStore = useConfig("nested");
</script>

<div>
  <div>
    <div data-testid="deep">{$valueStore}</div>
  </div>
</div>
