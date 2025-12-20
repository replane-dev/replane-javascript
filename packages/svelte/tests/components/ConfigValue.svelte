<script lang="ts">
  import type { Readable } from "svelte/store";

  interface Props {
    store: Readable<unknown>;
    testId: string;
  }

  let { store, testId }: Props = $props();
</script>

<div data-testid="value-{testId}">{String($store)}</div>
