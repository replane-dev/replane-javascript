<script lang="ts">
  import type { ReplaneContextOptions } from "../../src/types";
  import ReplaneContext from "../../src/ReplaneContext.svelte";

  interface Props {
    options: ReplaneContextOptions<any>;
  }

  let { options }: Props = $props();

  let error = $state<unknown>(null);
  let errorMessage = $derived(error instanceof Error ? error.message : String(error));
</script>

<svelte:boundary
  onerror={(e) => {
    error = e;
  }}
>
  <ReplaneContext {options}>
    {#snippet children()}
      <div data-testid="content">Client ready</div>
    {/snippet}

    {#snippet loader()}
      <div data-testid="loader">Loading...</div>
    {/snippet}
  </ReplaneContext>
</svelte:boundary>

{#if error}
  <div data-testid="error">{errorMessage}</div>
{/if}
