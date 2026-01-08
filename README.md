<h1 align="center">Replane JavaScript</h1>
<p align="center">Dynamic configuration for JavaScript and TypeScript applications.</p>

<p align="center">
  <a href="https://cloud.replane.dev"><img src="https://img.shields.io/badge/Try-Replane%20Cloud-blue" alt="Replane Cloud"></a>
  <a href="https://github.com/replane-dev/replane-javascript/actions"><img src="https://github.com/replane-dev/replane-javascript/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/replane-dev/replane-javascript/blob/main/LICENSE"><img src="https://img.shields.io/github/license/replane-dev/replane-javascript" alt="License"></a>
  <a href="https://github.com/orgs/replane-dev/discussions"><img src="https://img.shields.io/badge/discussions-join-blue?logo=github" alt="Community"></a>
</p>

<picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/replane-dev/replane/main/public/replane-window-screenshot-dark-v1.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/replane-dev/replane/main/public/replane-window-screenshot-light-with-border-v2.jpg">
    <img alt="Replane Screenshot" src="https://raw.githubusercontent.com/replane-dev/replane/main/public/replane-window-screenshot-light-with-border-v2.jpg">
</picture>

[Replane](https://github.com/replane-dev/replane) is a dynamic configuration manager that lets you tweak your software without running scripts or building your own admin panel. Store feature flags, rate limits, UI text, log level, rollout percentage, and more. Delegate editing to teammates and share config across services. No redeploys needed.

## Why Dynamic Configuration?

- **Feature flags** – toggle features, run A/B tests, roll out to user segments
- **Operational tuning** – adjust limits, TTLs, and timeouts without redeploying
- **Per-environment settings** – different values for production, staging, dev
- **Incident response** – instantly revert to a known-good version
- **Cross-service configuration** – share settings with realtime sync
- **Non-engineer access** – safe editing with schema validation

## Packages

| Package                                  | Description                                   | Links                                                                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@replanejs/sdk`](./packages/sdk)       | Core SDK for Node.js, Deno, Bun, and browsers | [![npm](https://img.shields.io/npm/v/@replanejs/sdk)](https://www.npmjs.com/package/@replanejs/sdk) · [GitHub](https://github.com/replane-dev/replane-javascript/tree/main/packages/sdk#readme)          |
| [`@replanejs/react`](./packages/react)   | React bindings with hooks and context         | [![npm](https://img.shields.io/npm/v/@replanejs/react)](https://www.npmjs.com/package/@replanejs/react) · [GitHub](https://github.com/replane-dev/replane-javascript/tree/main/packages/react#readme)    |
| [`@replanejs/next`](./packages/next)     | Next.js SDK with SSR/SSG support              | [![npm](https://img.shields.io/npm/v/@replanejs/next)](https://www.npmjs.com/package/@replanejs/next) · [GitHub](https://github.com/replane-dev/replane-javascript/tree/main/packages/next#readme)       |
| [`@replanejs/svelte`](./packages/svelte) | Svelte bindings with stores                   | [![npm](https://img.shields.io/npm/v/@replanejs/svelte)](https://www.npmjs.com/package/@replanejs/svelte) · [GitHub](https://github.com/replane-dev/replane-javascript/tree/main/packages/svelte#readme) |

## Quick Start

### Core SDK

```bash
npm install @replanejs/sdk
```

```ts
import { Replane } from "@replanejs/sdk";

const replane = new Replane();
await replane.connect({
  sdkKey: process.env.REPLANE_SDK_KEY!,
  baseUrl: "https://cloud.replane.dev", // or your self-hosted URL
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
        baseUrl: "https://cloud.replane.dev", // or your self-hosted URL
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
  import { ReplaneContext } from "@replanejs/svelte";
</script>

<ReplaneContext
  options={{
    baseUrl: "https://cloud.replane.dev", // or your self-hosted URL
    sdkKey: "your-sdk-key",
  }}
>
  <slot />
</ReplaneContext>
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
