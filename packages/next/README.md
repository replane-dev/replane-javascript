# @replanejs/next

Next.js SDK for Replane - feature flags and remote configuration with SSR support.

## Features

- **SSR Hydration**: Fetch configs on the server, instantly hydrate on the client
- **Zero Loading States**: Users see correct feature flags immediately
- **Real-time Updates**: Optional live connection for instant config changes
- **Type-safe**: Full TypeScript support with generics
- **Next.js Optimized**: Works with App Router, Pages Router, and Server Components

## Installation

```bash
npm install @replanejs/next
# or
pnpm add @replanejs/next
# or
yarn add @replanejs/next
```

## Quick Start

### 1. Set up environment variables

```env
# Server-side (not exposed to browser)
REPLANE_BASE_URL=https://your-replane-instance.com
REPLANE_SDK_KEY=rp_your_server_sdk_key

# Client-side (exposed to browser, for real-time updates)
NEXT_PUBLIC_REPLANE_BASE_URL=https://your-replane-instance.com
NEXT_PUBLIC_REPLANE_SDK_KEY=rp_your_client_sdk_key
```

### 2. Create the provider in your layout (App Router)

```tsx
// app/layout.tsx
import { getReplaneSnapshot } from "@replanejs/next/server";
import { ReplaneNextProvider } from "@replanejs/next";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const snapshot = await getReplaneSnapshot({
    baseUrl: process.env.REPLANE_BASE_URL!,
    sdkKey: process.env.REPLANE_SDK_KEY!,
  });

  return (
    <html lang="en">
      <body>
        <ReplaneNextProvider
          snapshot={snapshot}
          connection={{
            baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
            sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
          }}
        >
          {children}
        </ReplaneNextProvider>
      </body>
    </html>
  );
}
```

### 3. Use configs in your components

```tsx
// app/components/feature.tsx
"use client";

import { useConfig } from "@replanejs/next";

export function FeatureComponent() {
  const isEnabled = useConfig<boolean>("my-feature");
  const maxItems = useConfig<number>("max-items");

  if (!isEnabled) {
    return null;
  }

  return <div>Feature enabled! Max items: {maxItems}</div>;
}
```

## API Reference

### Server Functions

#### `getReplaneSnapshot(options)`

Fetches configs from Replane and returns a serializable snapshot for client-side hydration.

```tsx
import { getReplaneSnapshot } from "@replanejs/next/server";

const snapshot = await getReplaneSnapshot({
  // Required
  baseUrl: "https://your-replane-instance.com",
  sdkKey: "rp_your_sdk_key",

  // Optional
  fetchFn: customFetch, // Custom fetch for caching
  requestTimeoutMs: 2000, // Request timeout (default: 2000)
  initializationTimeoutMs: 5000, // Init timeout (default: 5000)
  context: { userId: "123" }, // Context for override evaluation
  required: ["feature-a", "feature-b"], // Required configs
  fallbacks: { "feature-a": false }, // Fallback values
});
```

#### `getConfig(options)`

Get a single config value directly on the server.

```tsx
import { getConfig } from "@replanejs/next/server";

const maintenanceMode = await getConfig<boolean>({
  name: "maintenance-mode",
  baseUrl: process.env.REPLANE_BASE_URL!,
  sdkKey: process.env.REPLANE_SDK_KEY!,
  context: { region: "us-east" },
});

if (maintenanceMode) {
  return <MaintenancePage />;
}
```

### Client Components

#### `ReplaneNextProvider`

Main provider component for SSR hydration.

```tsx
import { ReplaneNextProvider } from "@replanejs/next";

<ReplaneNextProvider
  snapshot={snapshot} // Required: from getReplaneSnapshot()
  connection={{
    // Optional: for real-time updates
    baseUrl: "https://...",
    sdkKey: "rp_...",
    requestTimeoutMs: 2000,
    retryDelayMs: 200,
    inactivityTimeoutMs: 30000,
  }}
  context={{ userId: "123" }} // Optional: override context on client
>
  {children}
</ReplaneNextProvider>;
```

#### `ReplaneScriptProvider`

Alternative hydration pattern using embedded scripts.

```tsx
// In layout (Server Component)
import { getReplaneSnapshotScript, ReplaneScriptProvider } from "@replanejs/next";

export default async function RootLayout({ children }) {
  const snapshot = await getReplaneSnapshot({ ... });

  return (
    <html>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: getReplaneSnapshotScript(snapshot),
          }}
        />
      </head>
      <body>
        <ReplaneScriptProvider connection={{ baseUrl, sdkKey }}>
          {children}
        </ReplaneScriptProvider>
      </body>
    </html>
  );
}
```

### Hooks

#### `useConfig<T>(name, options?)`

Subscribe to a specific config with reactive updates.

```tsx
import { useConfig } from "@replanejs/next";

function MyComponent() {
  // Basic usage
  const feature = useConfig<boolean>("feature-flag");

  // With context override
  const price = useConfig<number>("pricing", {
    context: { plan: "premium" },
  });

  return <div>{feature ? "Enabled" : "Disabled"}</div>;
}
```

#### `useReplane()`

Access the underlying Replane client.

```tsx
import { useReplane } from "@replanejs/next";

function MyComponent() {
  const { client } = useReplane();

  // Access client methods
  const snapshot = client.getSnapshot();

  return <div>...</div>;
}
```

## Advanced Usage

### Next.js Caching

Use Next.js fetch caching with `getReplaneSnapshot`:

```tsx
// ISR: Revalidate every 60 seconds
const snapshot = await getReplaneSnapshot({
  baseUrl: process.env.REPLANE_BASE_URL!,
  sdkKey: process.env.REPLANE_SDK_KEY!,
  fetchFn: (url, init) =>
    fetch(url, {
      ...init,
      next: { revalidate: 60 },
    }),
});
```

```tsx
// On-demand revalidation with tags
const snapshot = await getReplaneSnapshot({
  baseUrl: process.env.REPLANE_BASE_URL!,
  sdkKey: process.env.REPLANE_SDK_KEY!,
  fetchFn: (url, init) =>
    fetch(url, {
      ...init,
      next: { tags: ["replane-config"] },
    }),
});

// In a server action or route handler:
// revalidateTag('replane-config');
```

### Static Snapshot (No Real-time Updates)

For static sites or when real-time updates aren't needed:

```tsx
<ReplaneNextProvider snapshot={snapshot}>
  {/* No connection prop = no live updates */}
  {children}
</ReplaneNextProvider>
```

### Pages Router Support

```tsx
// pages/_app.tsx
import { ReplaneNextProvider } from "@replanejs/next";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ReplaneNextProvider
      snapshot={pageProps.replaneSnapshot}
      connection={{
        baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
        sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
      }}
    >
      <Component {...pageProps} />
    </ReplaneNextProvider>
  );
}
```

```tsx
// pages/index.tsx
import { getReplaneSnapshot } from "@replanejs/next/server";
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => {
  const replaneSnapshot = await getReplaneSnapshot({
    baseUrl: process.env.REPLANE_BASE_URL!,
    sdkKey: process.env.REPLANE_SDK_KEY!,
  });

  return {
    props: { replaneSnapshot },
  };
};
```

### Context-based Overrides

Pass user context for personalized config values:

```tsx
// Server-side: include context in snapshot
const snapshot = await getReplaneSnapshot({
  baseUrl: process.env.REPLANE_BASE_URL!,
  sdkKey: process.env.REPLANE_SDK_KEY!,
  context: {
    userId: user.id,
    plan: user.subscription,
    country: user.country,
  },
});

// Client-side: override or extend context
<ReplaneNextProvider
  snapshot={snapshot}
  context={{
    // Add client-specific context
    browser: navigator.userAgent,
    screenSize: window.innerWidth > 768 ? "desktop" : "mobile",
  }}
>
  {children}
</ReplaneNextProvider>
```

### Required Configs

Ensure specific configs are loaded before rendering:

```tsx
const snapshot = await getReplaneSnapshot({
  baseUrl: process.env.REPLANE_BASE_URL!,
  sdkKey: process.env.REPLANE_SDK_KEY!,
  required: ["critical-feature", "api-endpoint"],
  // Or with default values:
  required: {
    "critical-feature": true,
    "api-endpoint": "https://default.api.com",
  },
});
```

### Error Handling with Fallbacks

Provide fallback values for resilience:

```tsx
const snapshot = await getReplaneSnapshot({
  baseUrl: process.env.REPLANE_BASE_URL!,
  sdkKey: process.env.REPLANE_SDK_KEY!,
  fallbacks: {
    "feature-flag": false,
    "max-items": 10,
    "api-endpoint": "https://fallback.api.com",
  },
});
```

## TypeScript

Define your config types for full type safety:

```tsx
// types/replane.ts
export interface ReplaneConfigs {
  "feature-flag": boolean;
  "max-items": number;
  "api-endpoint": string;
  theme: {
    primaryColor: string;
    darkMode: boolean;
  };
}
```

```tsx
// Use with generics
import type { ReplaneConfigs } from "./types/replane";

const snapshot = await getReplaneSnapshot<ReplaneConfigs>({
  baseUrl: process.env.REPLANE_BASE_URL!,
  sdkKey: process.env.REPLANE_SDK_KEY!,
});

// In components
const theme = useConfig<ReplaneConfigs["theme"]>("theme");
```

## Why SSR Hydration?

The snapshot pattern minimizes latency by:

1. **Server Fetch**: Configs are fetched during SSR (no client-side request delay)
2. **Instant Hydration**: Client instantly has all config values (no loading states)
3. **Optional Live Updates**: Real-time connection established after hydration

This means users see correct feature flags immediately without any loading states or flashes of incorrect content.

## Requirements

- Next.js >= 13.0.0
- React >= 18.0.0
- Node.js >= 18.0.0

## License

MIT
