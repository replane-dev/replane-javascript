# @replanejs/svelte

Svelte SDK for [Replane](https://github.com/replane-dev/replane-javascript) - feature flags and remote configuration with reactive stores.

## Installation

```bash
npm install @replanejs/svelte
# or
pnpm add @replanejs/svelte
# or
yarn add @replanejs/svelte
```

## Requirements

- Svelte 4.0.0 or higher (Svelte 5 supported)
- Node.js 18.0.0 or higher

## Quick Start

```svelte
<script>
  import { ReplaneProvider, useConfig } from '@replanejs/svelte';
  import { createReplaneClient } from '@replanejs/sdk';

  const client = await createReplaneClient({
    baseUrl: 'https://your-replane-server.com',
    sdkKey: 'your-sdk-key',
  });
</script>

<ReplaneProvider {client}>
  <MyComponent />
</ReplaneProvider>
```

```svelte
<!-- MyComponent.svelte -->
<script>
  import { useConfig } from '@replanejs/svelte';

  const isFeatureEnabled = useConfig<boolean>('feature-flag-name');
</script>

{#if $isFeatureEnabled}
  <p>Feature is enabled!</p>
{:else}
  <p>Feature is disabled</p>
{/if}
```

## API

### ReplaneProvider

Provider component that makes the Replane client available to your component tree. Use this when you have a pre-created client.

```svelte
<script>
  import { ReplaneProvider } from '@replanejs/svelte';
  import { createReplaneClient } from '@replanejs/sdk';

  const client = await createReplaneClient({
    baseUrl: 'https://your-replane-server.com',
    sdkKey: 'your-sdk-key',
  });
</script>

<ReplaneProvider {client}>
  <App />
</ReplaneProvider>
```

### ReplaneProviderAsync

Provider component that creates and manages the client internally. Handles loading and error states.

```svelte
<script>
  import { ReplaneProviderAsync } from '@replanejs/svelte';

  const options = {
    baseUrl: 'https://your-replane-server.com',
    sdkKey: 'your-sdk-key',
  };

  function handleError(error) {
    console.error('Failed to initialize Replane:', error);
  }
</script>

<ReplaneProviderAsync {options} onError={handleError}>
  <App />

  {#snippet loader()}
    <p>Loading configuration...</p>
  {/snippet}
</ReplaneProviderAsync>
```

### useConfig

Create a reactive store for a specific config value. The store automatically updates when the config value changes on the server.

Must be called during component initialization (in the script section, not in event handlers).

```svelte
<script>
  import { useConfig } from '@replanejs/svelte';

  // Basic usage - returns a Svelte readable store
  const featureEnabled = useConfig<boolean>('featureEnabled');

  // With evaluation context
  const greeting = useConfig<string>('greeting', {
    context: { userId: '123', isPremium: true }
  });
</script>

{#if $featureEnabled}
  <p>{$greeting}</p>
{/if}
```

### useReplane

Get direct access to the Replane client from context.

```svelte
<script>
  import { useReplane } from '@replanejs/svelte';

  const { client } = useReplane();

  function handleClick() {
    // Access client methods directly
    const value = client.get('some-config');
    console.log(value);
  }
</script>

<button onclick={handleClick}>Get Config</button>
```

### createConfigStore

Create a reactive store for a config value using a pre-existing client. Useful when you have direct access to a client and don't want to use the context-based approach.

```svelte
<script>
  import { createConfigStore } from '@replanejs/svelte';
  import { client } from './replane-client';

  const featureEnabled = createConfigStore<boolean>(client, 'featureEnabled');

  // With context
  const userGreeting = createConfigStore<string>(client, 'greeting', {
    context: { userId: '123' }
  });
</script>

{#if $featureEnabled}
  <p>{$userGreeting}</p>
{/if}
```

## TypeScript

The SDK is fully typed. You can provide type parameters to get type-safe configuration values:

```svelte
<script lang="ts">
  import { useConfig, useReplane } from '@replanejs/svelte';

  interface MyConfigs {
    theme: 'light' | 'dark';
    maxItems: number;
    features: {
      analytics: boolean;
      notifications: boolean;
    };
  }

  // Type-safe stores
  const theme = useConfig<MyConfigs['theme']>('theme');
  const maxItems = useConfig<MyConfigs['maxItems']>('maxItems');

  // Typed client access
  const { client } = useReplane<MyConfigs>();
</script>

<p>Theme: {$theme}, Max items: {$maxItems}</p>
```

## Context Utilities

For advanced use cases, you can directly interact with the Svelte context:

```svelte
<script>
  import { setReplaneContext, getReplaneContext, hasReplaneContext } from '@replanejs/svelte';

  // Check if context exists
  if (hasReplaneContext()) {
    const { client } = getReplaneContext();
    // Use client...
  }
</script>
```

## Realtime Updates

All stores created with `useConfig` or `createConfigStore` automatically subscribe to realtime updates via Server-Sent Events (SSE). When a config value changes on the server, the store updates and your component re-renders automatically.

```svelte
<script>
  import { useConfig } from '@replanejs/svelte';

  // This store will automatically update when 'maintenance-mode' changes
  const maintenanceMode = useConfig<boolean>('maintenance-mode');
</script>

{#if $maintenanceMode}
  <MaintenanceBanner />
{/if}
```

## License

MIT

