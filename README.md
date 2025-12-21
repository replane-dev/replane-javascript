# Replane JavaScript

Official JavaScript/TypeScript SDKs for [Replane](https://github.com/replane-dev/replane) — feature flags and remote configuration with realtime updates.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@replanejs/sdk`](./packages/sdk) | Core SDK for Node.js, Deno, Bun, and browsers | [![npm](https://img.shields.io/npm/v/@replanejs/sdk)](https://www.npmjs.com/package/@replanejs/sdk) |
| [`@replanejs/react`](./packages/react) | React bindings with hooks and context | [![npm](https://img.shields.io/npm/v/@replanejs/react)](https://www.npmjs.com/package/@replanejs/react) |
| [`@replanejs/svelte`](./packages/svelte) | Svelte bindings with stores | [![npm](https://img.shields.io/npm/v/@replanejs/svelte)](https://www.npmjs.com/package/@replanejs/svelte) |

## Quick Start

### Core SDK

```bash
npm install @replanejs/sdk
```

```ts
import { createReplaneClient } from "@replanejs/sdk";

const replane = await createReplaneClient({
  sdkKey: process.env.REPLANE_SDK_KEY!,
  baseUrl: "https://replane.example.com",
});

const featureEnabled = replane.get("my-feature");
```

### React

```bash
npm install @replanejs/react
```

```tsx
import { ReplaneProvider, useConfig } from "@replanejs/react";

function App() {
  return (
    <ReplaneProvider client={replaneClient}>
      <MyComponent />
    </ReplaneProvider>
  );
}

function MyComponent() {
  const featureEnabled = useConfig("my-feature");
  return featureEnabled ? <NewFeature /> : <OldFeature />;
}
```

### Svelte

```bash
npm install @replanejs/svelte
```

```svelte
<script>
  import { ReplaneProvider, useConfig } from "@replanejs/svelte";
  
  const featureEnabled = useConfig("my-feature");
</script>

<ReplaneProvider client={replaneClient}>
  {#if $featureEnabled}
    <NewFeature />
  {:else}
    <OldFeature />
  {/if}
</ReplaneProvider>
```

## Features

- **Realtime updates** — Configs update instantly via Server-Sent Events (SSE)
- **Context-based overrides** — Feature flags, A/B testing, gradual rollouts
- **Type-safe** — Full TypeScript support with inference
- **Framework integrations** — React, Svelte, and more
- **Tiny footprint** — Zero runtime dependencies in core SDK
- **SSR support** — Server-side rendering with hydration

## Examples

See the [`examples/`](./examples) directory for complete working examples:

- [`examples/sdk`](./examples/sdk) — Core SDK usage
- [`examples/react`](./examples/react) — React integration
- [`examples/svelte`](./examples/svelte) — SvelteKit

## Development

This is a monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces).

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## License

MIT
