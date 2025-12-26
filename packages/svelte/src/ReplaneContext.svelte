<script lang="ts" module>
  import type { Replane } from "@replanejs/sdk";
  import type {
    ReplaneContextProps,
    ReplaneContextWithClientProps,
    ReplaneContextWithOptionsProps,
  } from "./types";
  import { DEFAULT_AGENT } from "./version";

  export type {
    ReplaneContextProps,
    ReplaneContextWithClientProps,
    ReplaneContextWithOptionsProps,
  };
</script>

<script lang="ts" generics="T extends object">
  import { Replane as ReplaneClass } from "@replanejs/sdk";
  import { setReplaneContext } from "./context";
  import { hasClient } from "./types";

  let props: ReplaneContextProps<T> = $props();

  type ClientState =
    | { status: "loading"; client: null; error: null }
    | { status: "ready"; client: Replane<T>; error: null }
    | { status: "error"; client: null; error: Error };

  let state = $state<ClientState>({ status: "loading", client: null, error: null });
  let clientRef: Replane<T> | null = null;
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
      // Restore from snapshot synchronously, connect in background
      try {
        const client = new ReplaneClass<T>({
          snapshot,
          logger: options.logger,
          context: options.context,
          defaults: options.defaults,
        });
        // Start connection in background (don't await)
        client.connect({
          baseUrl: options.baseUrl,
          sdkKey: options.sdkKey,
          fetchFn: options.fetchFn,
          requestTimeoutMs: options.requestTimeoutMs,
          retryDelayMs: options.retryDelayMs,
          inactivityTimeoutMs: options.inactivityTimeoutMs,
          connectTimeoutMs: options.connectTimeoutMs,
          agent: options.agent ?? DEFAULT_AGENT,
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

    const client = new ReplaneClass<T>({
      logger: options.logger,
      context: options.context,
      defaults: options.defaults,
    });

    client
      .connect({
        baseUrl: options.baseUrl,
        sdkKey: options.sdkKey,
        fetchFn: options.fetchFn,
        requestTimeoutMs: options.requestTimeoutMs,
        retryDelayMs: options.retryDelayMs,
        inactivityTimeoutMs: options.inactivityTimeoutMs,
        connectTimeoutMs: options.connectTimeoutMs,
        agent: options.agent ?? DEFAULT_AGENT,
      })
      .then(() => {
        if (cancelled) {
          client.disconnect();
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
      // Only disconnect client if we created it (not pre-created)
      if (clientRef && !hasClient(props)) {
        clientRef.disconnect();
        clientRef = null;
      }
    };
  });

  // Set context when client is ready
  $effect(() => {
    if (state.status === "ready" && state.client) {
      setReplaneContext<T>(state.client);
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
