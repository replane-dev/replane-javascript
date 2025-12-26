<script lang="ts">
  import type { ConnectOptions, ReplaneLogger, ReplaneContext as ReplaneContextType } from "@replanejs/sdk";
  import ReplaneContext from "../../src/ReplaneContext.svelte";
  import TestAsyncConfigReader from "./TestAsyncConfigReader.svelte";

  interface Props {
    connection: ConnectOptions | null;
    defaults?: Record<string, unknown>;
    context?: ReplaneContextType;
    logger?: ReplaneLogger;
    configName: string;
  }

  let { connection, defaults, context, logger, configName }: Props = $props();

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
      <div data-testid="content">
        <TestAsyncConfigReader {configName} />
      </div>
    {/snippet}
  </ReplaneContext>
</svelte:boundary>

{#if error}
  <div data-testid="error">{errorMessage}</div>
{/if}
