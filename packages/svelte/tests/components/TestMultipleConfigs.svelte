<script lang="ts">
  import type { ReplaneClient } from "@replanejs/sdk";
  import { setReplaneContext } from "../../src/context";
  import { createConfigStore } from "../../src/stores";
  import type { Readable } from "svelte/store";
  import ConfigValue from "./ConfigValue.svelte";

  interface Props {
    client: ReplaneClient<any>;
    configNames: string[];
    testId?: string[];
  }

  let { client, configNames, testId }: Props = $props();

  // Set context (simulating what ReplaneProvider does)
  setReplaneContext(client);

  // Create stores at top level using createConfigStore which doesn't need context
  const stores: Readable<unknown>[] = configNames.map((name) => createConfigStore(client, name));

  function getTestId(index: number): string {
    if (testId && testId[index]) {
      return testId[index];
    }
    return configNames[index];
  }
</script>

{#each stores as store, index}
  <ConfigValue {store} testId={getTestId(index)} />
{/each}
