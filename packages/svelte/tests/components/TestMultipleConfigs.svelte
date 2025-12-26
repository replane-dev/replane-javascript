<script lang="ts">
  import type { Replane } from "@replanejs/sdk";
  import { setReplaneContext } from "../../src/context";
  import { configFrom } from "../../src/stores";
  import type { Readable } from "svelte/store";
  import ConfigValue from "./ConfigValue.svelte";

  interface Props {
    client: Replane<any>;
    configNames: string[];
    testId?: string[];
  }

  let { client, configNames, testId }: Props = $props();

  // Set context (simulating what ReplaneContext does)
  // svelte-ignore state_referenced_locally
  setReplaneContext(client);

  // Create stores at top level using configFrom which doesn't need context
  // svelte-ignore state_referenced_locally
  const stores: Readable<unknown>[] = configNames.map((name) => configFrom(client, name));

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
