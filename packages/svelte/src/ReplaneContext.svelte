<script lang="ts" module>
  import type { ReplaneClient } from "@replanejs/sdk";
  import type {
    ReplaneContextProps,
    ReplaneContextWithClientProps,
    ReplaneContextWithOptionsProps,
  } from "./types";

  export type {
    ReplaneContextProps,
    ReplaneContextWithClientProps,
    ReplaneContextWithOptionsProps,
  };
</script>

<script lang="ts">
  import { createReplaneClient, restoreReplaneClient } from "@replanejs/sdk";
  import { setReplaneContext } from "./context";
  import { hasClient } from "./types";

  let props: ReplaneContextProps = $props();

  type ClientState =
    | { status: "loading"; client: null; error: null }
    | { status: "ready"; client: ReplaneClient<any>; error: null }
    | { status: "error"; client: null; error: Error };

  let state = $state<ClientState>({ status: "loading", client: null, error: null });
  let clientRef: ReplaneClient<any> | null = null;
  let cancelled = false;

  // Handle client initialization based on props
  $effect(() => {
    cancelled = false;

    if (hasClient(props)) {
      // Pre-created client - use directly
      state = { status: "ready", client: props.client, error: null };
      return;
    }

    // Options-based initialization
    const { options, snapshot } = props;

    if (snapshot) {
      // Restore from snapshot synchronously
      try {
        const client = restoreReplaneClient({
          snapshot,
          connection: {
            baseUrl: options.baseUrl,
            sdkKey: options.sdkKey,
            fetchFn: options.fetchFn,
            requestTimeoutMs: options.requestTimeoutMs,
            retryDelayMs: options.retryDelayMs,
            inactivityTimeoutMs: options.inactivityTimeoutMs,
            logger: options.logger,
          },
          context: options.context,
        });
        clientRef = client;
        state = { status: "ready", client, error: null };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        state = { status: "error", client: null, error };
      }
      return;
    }

    // Async client creation
    state = { status: "loading", client: null, error: null };

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
      });

    return () => {
      cancelled = true;
      // Only close client if we created it (not pre-created)
      if (clientRef && !hasClient(props)) {
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

  // Get children and loader from props
  const children = $derived(props.children);
  const loader = $derived(hasClient(props) ? undefined : props.loader);
</script>

{#if state.status === "loading"}
  {#if loader}
    {@render loader()}
  {/if}
{:else if state.status === "error"}
  {(() => {
    throw state.error;
  })()}
{:else if state.status === "ready"}
  {@render children()}
{/if}
