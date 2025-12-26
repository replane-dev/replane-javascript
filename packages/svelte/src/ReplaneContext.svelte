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

  // Determine if we're in sync mode (client available immediately)
  // This must be computed during initialization, not reactively
  function computeInitialState(): {
    state: ClientState;
    client: Replane<T> | null;
    isSyncMode: boolean;
  } {
    // Pre-created client - use directly
    if (hasClient(props)) {
      return {
        state: { status: "ready", client: props.client, error: null },
        client: props.client,
        isSyncMode: true,
      };
    }

    const { connection, snapshot, context, logger, defaults } = props;
    const isAsync = props.async;

    // Sync mode: snapshot, no connection, or async flag
    if (snapshot || !connection || isAsync) {
      try {
        const client = new ReplaneClass<T>({
          snapshot,
          logger,
          context,
          defaults,
        });
        return {
          state: { status: "ready", client, error: null },
          client,
          isSyncMode: true,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        return {
          state: { status: "error", client: null, error },
          client: null,
          isSyncMode: true,
        };
      }
    }

    // Loading mode: need to wait for connection
    return {
      state: { status: "loading", client: null, error: null },
      client: null,
      isSyncMode: false,
    };
  }

  // Compute initial state synchronously during component initialization
  const initialState = computeInitialState();
  let state = $state<ClientState>(initialState.state);
  let clientRef: Replane<T> | null = initialState.client;

  // Set context immediately for sync mode (during initialization)
  if (initialState.isSyncMode && initialState.client) {
    setReplaneContext<T>(initialState.client);
  }

  let cancelled = false;

  // Handle async connection for sync mode, or full async flow for loading mode
  $effect(() => {
    cancelled = false;

    if (hasClient(props)) {
      // Pre-created client - already set up synchronously
      return;
    }

    const { connection, logger } = props;

    // Get connection options with default agent
    const connectionWithAgent = connection
      ? {
          ...connection,
          agent: connection.agent ?? DEFAULT_AGENT,
        }
      : undefined;

    if (initialState.isSyncMode) {
      // Sync mode - client already created, just need to connect in background
      if (connectionWithAgent && clientRef) {
        clientRef.connect(connectionWithAgent).catch((err) => {
          (logger ?? console)?.error("Failed to connect Replane client", err);
        });
      }
      return;
    }

    // Loading mode - create client and connect
    const { context, defaults } = props;

    const client = new ReplaneClass<T>({
      logger,
      context,
      defaults,
    });

    client
      .connect(connectionWithAgent!)
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

  // Set context when client becomes ready in loading mode
  // This uses $effect.pre to run before children render
  $effect(() => {
    if (!initialState.isSyncMode && state.status === "ready" && state.client) {
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
