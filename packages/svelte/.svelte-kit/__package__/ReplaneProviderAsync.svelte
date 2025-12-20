<script lang="ts" module>
  import type { ReplaneClientOptions } from "@replanejs/sdk";
  import type { Snippet } from "svelte";

  export interface ReplaneProviderAsyncProps {
    /** Options to create the ReplaneClient */
    options: ReplaneClientOptions<any>;
    /** Children snippet */
    children: Snippet;
    /**
     * Optional loading snippet to show while the client is initializing.
     * If not provided, nothing will render until ready.
     */
    loader?: Snippet;
    /**
     * Callback when client initialization fails.
     */
    onError?: (error: Error) => void;
  }
</script>

<script lang="ts">
  import { createReplaneClient, type ReplaneClient } from "@replanejs/sdk";
  import { setReplaneContext } from "./context";

  let { options, children, loader, onError }: ReplaneProviderAsyncProps = $props();

  type ClientState =
    | { status: "loading"; client: null; error: null }
    | { status: "ready"; client: ReplaneClient<any>; error: null }
    | { status: "error"; client: null; error: Error };

  let state = $state<ClientState>({ status: "loading", client: null, error: null });
  let clientRef: ReplaneClient<any> | null = null;
  let cancelled = false;

  // Initialize the client
  $effect(() => {
    cancelled = false;

    createReplaneClient(options)
      .then((client) => {
        if (cancelled) {
          client.close();
          return;
        }
        clientRef = client;
        state = { status: "ready", client, error: null };
      })
      .catch((err) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        state = { status: "error", client: null, error };
        onError?.(error);
      });

    return () => {
      cancelled = true;
      if (clientRef) {
        clientRef.close();
        clientRef = null;
      }
    };
  });

  // Set context when client is ready
  $effect(() => {
    if (state.status === "ready" && state.client) {
      setReplaneContext(state.client);
    }
  });
</script>

{#if state.status === "loading"}
  {#if loader}
    {@render loader()}
  {/if}
{:else if state.status === "error"}
  {#if loader}
    {@render loader()}
  {/if}
{:else if state.status === "ready"}
  {@render children()}
{/if}
