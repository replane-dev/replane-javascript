<script lang="ts">
  import type { ReplaneClientOptions } from "@replanejs/sdk";
  import ReplaneContext from "../../src/ReplaneContext.svelte";

  interface Props {
    options: ReplaneClientOptions<any>;
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
