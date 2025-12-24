# @replanejs/svelte

[![npm](https://img.shields.io/npm/v/@replanejs/svelte)](https://www.npmjs.com/package/@replanejs/svelte)
[![License](https://img.shields.io/github/license/replane-dev/replane-javascript)](https://github.com/replane-dev/replane-javascript/blob/main/LICENSE)
[![Community](https://img.shields.io/badge/discussions-join-blue?logo=github)](https://github.com/orgs/replane-dev/discussions)

Svelte SDK for [Replane](https://github.com/replane-dev/replane) - feature flags and remote configuration with reactive stores.

## Installation

```bash
npm install @replanejs/svelte
```

## Quick Start

```svelte
<script>
  import { ReplaneContext, config } from '@replanejs/svelte';
  import { createReplaneClient } from '@replanejs/svelte';

  const replane = await createReplaneClient({
    baseUrl: 'https://your-replane-server.com',
    sdkKey: 'your-sdk-key',
  });
</script>

<ReplaneContext client={replane}>
  <MyComponent />
</ReplaneContext>
```

```svelte
<!-- MyComponent.svelte -->
<script>
  import { config } from '@replanejs/svelte';

  const feature = config<boolean>('feature-flag-name');
</script>

{#if $feature}
  <p>Feature is enabled!</p>
{:else}
  <p>Feature is disabled</p>
{/if}
```

## Client Options

The `options` prop accepts all options from `@replanejs/sdk`. Key options:

| Option                    | Type                   | Required | Description                                |
| ------------------------- | ---------------------- | -------- | ------------------------------------------ |
| `baseUrl`                 | `string`               | Yes      | Replane server URL                         |
| `sdkKey`                  | `string`               | Yes      | SDK key for authentication                 |
| `context`                 | `Record<string, any>`  | No       | Default context for override evaluations   |
| `defaults`                | `Record<string, any>`  | No       | Default values if server is unavailable    |
| `required`                | `string[]` or `object` | No       | Configs that must exist for initialization |
| `initializationTimeoutMs` | `number`               | No       | SDK initialization timeout (default: 5000) |

See [`@replanejs/sdk` documentation](https://github.com/replane-dev/replane-javascript/tree/main/packages/sdk#options) for the complete list of options.

## API

### config

Create a reactive store for a specific config value. Similar to `readable()` or `derived()`.

```svelte
<script>
  import { config } from '@replanejs/svelte';

  // Returns a Svelte readable store
  const featureEnabled = config<boolean>('featureEnabled');

  // With evaluation context
  const greeting = config<string>('greeting', {
    context: { userId: '123', isPremium: true }
  });
</script>

{#if $featureEnabled}
  <p>{$greeting}</p>
{/if}
```

### getReplane

Get direct access to the Replane client from context.

```svelte
<script>
  import { getReplane } from '@replanejs/svelte';

  const replane = getReplane();

  function handleClick() {
    const value = replane.get('some-config');
    console.log(value);
  }
</script>

<button onclick={handleClick}>Get Config</button>
```

### configFrom

Create a reactive store from a client directly (without context). Type-safe with full autocomplete for config names.

```svelte
<script>
  import { configFrom } from '@replanejs/svelte';
  import { replane } from './replane-client';

  // Config name is validated against TConfigs, return type is inferred
  const featureEnabled = configFrom(replane, 'featureEnabled');
</script>

{#if $featureEnabled}
  <p>Feature is enabled!</p>
{/if}
```

### ReplaneContext

Context component that makes the Replane client available to your component tree.

Can be used in three ways:

**1. With a pre-created client:**

```svelte
<script>
  import { ReplaneContext, createReplaneClient } from '@replanejs/svelte';

  const replane = await createReplaneClient({
    baseUrl: 'https://your-replane-server.com',
    sdkKey: 'your-sdk-key',
  });
</script>

<ReplaneContext client={replane}>
  <App />
</ReplaneContext>
```

**2. With options (client managed internally):**

```svelte
<script>
  import { ReplaneContext } from '@replanejs/svelte';

  const options = {
    baseUrl: 'https://your-replane-server.com',
    sdkKey: 'your-sdk-key',
  };
</script>

<svelte:boundary onerror={(e) => console.error(e)}>
  <ReplaneContext {options}>
    <App />

    {#snippet loader()}
      <p>Loading...</p>
    {/snippet}
  </ReplaneContext>

  {#snippet failed(error)}
    <p>Error: {error.message}</p>
  {/snippet}
</svelte:boundary>
```

**3. With a snapshot (for SSR/hydration):**

```svelte
<script>
  import { ReplaneContext } from '@replanejs/svelte';

  let { data, children } = $props();

  const options = {
    baseUrl: import.meta.env.VITE_REPLANE_BASE_URL,
    sdkKey: import.meta.env.VITE_REPLANE_SDK_KEY,
  };
</script>

<ReplaneContext {options} snapshot={data.replaneSnapshot}>
  {@render children()}
</ReplaneContext>
```

## Typed Stores

For better type safety, create typed versions of the store functions:

```ts
// $lib/replane/index.ts
import { createTypedConfig, createTypedReplane } from "@replanejs/svelte";

interface AppConfigs {
  theme: { darkMode: boolean; primaryColor: string };
  features: { betaEnabled: boolean };
}

export const appConfig = createTypedConfig<AppConfigs>();
export const getAppReplane = createTypedReplane<AppConfigs>();
```

```svelte
<script lang="ts">
  import { appConfig, getAppReplane } from '$lib/replane';

  // Config names autocomplete, values are fully typed
  const theme = appConfig("theme");
  // $theme is { darkMode: boolean; primaryColor: string }

  // Direct client access
  const replane = getAppReplane();
  const features = replane.get("features"); // fully typed
</script>

<div style:color={$theme.primaryColor}>
  {$theme.darkMode ? "Dark" : "Light"}
</div>
```

## SSR / SvelteKit

For server-side rendering, fetch configs on the server and restore on the client:

```ts
// src/routes/+layout.server.ts
import { getReplaneSnapshot } from "@replanejs/svelte";

export async function load() {
  const snapshot = await getReplaneSnapshot({
    baseUrl: import.meta.env.REPLANE_BASE_URL,
    sdkKey: import.meta.env.REPLANE_SDK_KEY,
  });

  return { replaneSnapshot: snapshot };
}
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { ReplaneContext } from '@replanejs/svelte';

  let { data, children } = $props();

  const options = {
    baseUrl: import.meta.env.VITE_REPLANE_BASE_URL,
    sdkKey: import.meta.env.VITE_REPLANE_SDK_KEY,
  };
</script>

<ReplaneContext {options} snapshot={data.replaneSnapshot}>
  {@render children()}
</ReplaneContext>
```

## Realtime Updates

All stores automatically subscribe to realtime updates via SSE. When a config changes on the server, the store updates automatically.

```svelte
<script>
  import { config } from '@replanejs/svelte';

  const maintenanceMode = config<boolean>('maintenance-mode');
</script>

{#if $maintenanceMode}
  <MaintenanceBanner />
{/if}
```

## Community

Have questions or want to discuss Replane? Join the conversation in [GitHub Discussions](https://github.com/orgs/replane-dev/discussions).

## License

MIT
