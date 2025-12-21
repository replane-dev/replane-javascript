# Replane JavaScript

Official JavaScript/TypeScript SDKs for [Replane](https://github.com/replane-dev/replane) — feature flags and remote configuration with realtime updates.

[![CI](https://github.com/replane-dev/replane-javascript/actions/workflows/ci.yml/badge.svg)](https://github.com/replane-dev/replane-javascript/actions)
[![License](https://img.shields.io/github/license/replane-dev/replane-javascript)](https://github.com/replane-dev/replane-javascript/blob/main/LICENSE)
[![Community](https://img.shields.io/badge/discussions-join-blue?logo=github)](https://github.com/orgs/replane-dev/discussions)

## Packages

| Package                                  | Description                                   | npm                                                                                                       |
| ---------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`@replanejs/sdk`](./packages/sdk)       | Core SDK for Node.js, Deno, Bun, and browsers | [![npm](https://img.shields.io/npm/v/@replanejs/sdk)](https://www.npmjs.com/package/@replanejs/sdk)       |
| [`@replanejs/react`](./packages/react)   | React bindings with hooks and context         | [![npm](https://img.shields.io/npm/v/@replanejs/react)](https://www.npmjs.com/package/@replanejs/react)   |
| [`@replanejs/next`](./packages/next)     | Next.js SDK with SSR/SSG support              | [![npm](https://img.shields.io/npm/v/@replanejs/next)](https://www.npmjs.com/package/@replanejs/next)     |
| [`@replanejs/svelte`](./packages/svelte) | Svelte bindings with stores                   | [![npm](https://img.shields.io/npm/v/@replanejs/svelte)](https://www.npmjs.com/package/@replanejs/svelte) |

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
    <ReplaneProvider
      options={{
        baseUrl: "https://replane.example.com",
        sdkKey: process.env.REPLANE_SDK_KEY!,
      }}
    >
      <MyComponent />
    </ReplaneProvider>
  );
}

function MyComponent() {
  const featureEnabled = useConfig("my-feature");
  return featureEnabled ? <NewFeature /> : <OldFeature />;
}
```

### Next.js

```bash
npm install @replanejs/next
```

**App Router:**

```tsx
// app/layout.tsx
import { ReplaneRoot } from "@replanejs/next";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <ReplaneRoot
          options={{
            baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
            sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
          }}
        >
          {children}
        </ReplaneRoot>
      </body>
    </html>
  );
}

// app/page.tsx (client component)
("use client");
import { useConfig } from "@replanejs/next";

export default function Page() {
  const theme = useConfig<{ darkMode: boolean }>("theme");
  return <div>{theme.darkMode ? "Dark" : "Light"}</div>;
}
```

### Svelte

```bash
npm install @replanejs/svelte
```

```svelte
<!-- +layout.svelte -->
<script>
  import { ReplaneProvider, createReplaneClient } from "@replanejs/svelte";

  const client = await createReplaneClient({
    baseUrl: "https://replane.example.com",
    sdkKey: "your-sdk-key",
  });
</script>

<ReplaneProvider {client}>
  <slot />
</ReplaneProvider>
```

```svelte
<!-- Component.svelte -->
<script>
  import { config } from "@replanejs/svelte";

  const feature = config("my-feature");
</script>

{#if $feature}
  <NewFeature />
{:else}
  <OldFeature />
{/if}
```

## Features

- **Realtime updates** — Configs update instantly via Server-Sent Events (SSE)
- **Context-based overrides** — Feature flags, A/B testing, gradual rollouts
- **Type-safe** — Full TypeScript support with generics and inference
- **Framework integrations** — React, Next.js, Svelte, and more
- **Tiny footprint** — Zero runtime dependencies in core SDK
- **SSR/SSG support** — Server-side rendering with hydration

## Examples

See the package directories for complete working examples:

- [`packages/sdk/examples`](./packages/sdk/examples) — Core SDK usage
- [`packages/react/examples`](./packages/react/examples) — React integration
- [`packages/next/examples`](./packages/next/examples) — Next.js (App Router & Pages Router)
- [`packages/svelte/examples`](./packages/svelte/examples) — SvelteKit

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution guidelines.

## Community

Have questions or want to discuss Replane? Join the conversation in [GitHub Discussions](https://github.com/orgs/replane-dev/discussions).

## License

MIT
