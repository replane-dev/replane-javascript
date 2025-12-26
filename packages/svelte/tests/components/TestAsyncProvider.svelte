<script lang="ts">
  import type { ConnectOptions, ReplaneLogger, ReplaneContext as ReplaneContextType } from "@replanejs/sdk";
  import ReplaneContext from "../../src/ReplaneContext.svelte";

  interface Props {
    connection: ConnectOptions | null;
    defaults?: Record<string, unknown>;
    context?: ReplaneContextType;
    logger?: ReplaneLogger;
  }

  let { connection, defaults, context, logger }: Props = $props();

  let error = $state<unknown>(null);
  let errorMessage = $derived(error instanceof Error ? error.message : String(error));
</script>

<svelte:boundary
  onerror={(e) => {
    error = e;
  }}
>
  <ReplaneContext {connection} {defaults} {context} {logger} async>
    {#snippet children()}
      <div data-testid="content">Client ready</div>
    {/snippet}
  </ReplaneContext>
</svelte:boundary>

{#if error}
  <div data-testid="error">{errorMessage}</div>
{/if}
