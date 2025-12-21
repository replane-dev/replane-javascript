# @replanejs/svelte Example

A Svelte + Vite example demonstrating how to use `@replanejs/svelte` for dynamic configuration with real-time updates.

## Setup

```bash
npm install
```

## Running

Create a `.env` file with your Replane credentials:

```env
VITE_REPLANE_SDK_KEY=your-sdk-key
VITE_REPLANE_BASE_URL=https://replane.example.com
```

Then start the development server:

```bash
npm run dev
```

Without credentials, the example will use an in-memory client with demo data.

## What this example demonstrates

- `ReplaneProvider` component for providing the client to the component tree
- `useConfig` store for reactive config values with automatic updates
- `useReplane` hook for direct client access
- Type-safe configuration with TypeScript
- Real-time updates via SSE
- Context-based override evaluation
- Fallback values for offline/error scenarios

## Key Svelte Patterns

### Using stores with auto-subscription

```svelte
<script>
  import { useConfig } from '@replanejs/svelte';

  // Returns a Svelte store - use $ prefix for auto-subscription
  const theme = useConfig('theme-config');
</script>

<!-- Auto-subscribes and re-renders on changes -->
<div style="color: {$theme.primaryColor}">
  Dark mode: {$theme.darkMode}
</div>
```

### Direct client access

```svelte
<script>
  import { useReplane } from '@replanejs/svelte';

  const { client } = useReplane();

  // Get config with context override
  const value = client.get('feature-flags', {
    context: { userId: '123', plan: 'premium' }
  });
</script>
```

### Using createConfigStore without provider

```svelte
<script>
  import { createConfigStore } from '@replanejs/svelte';
  import { client } from './my-client';

  // Create a store directly from a client instance
  const config = createConfigStore(client, 'my-config');
</script>

<div>{$config}</div>
```
