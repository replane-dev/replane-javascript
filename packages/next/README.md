# @replanejs/next

Next.js SDK for Replane - feature flags and remote configuration with SSR support.

## Installation

```bash
npm install @replanejs/next
# or
pnpm add @replanejs/next
```

## Quick Start

### App Router (Recommended)

**1. Set up ReplaneRoot in your layout:**

```tsx
// app/layout.tsx
import { ReplaneRoot } from "@replanejs/next";

interface AppConfigs {
  theme: { darkMode: boolean; primaryColor: string };
  features: { betaEnabled: boolean };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ReplaneRoot<AppConfigs>
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
```

**2. Use configs in client components:**

```tsx
// components/ThemeToggle.tsx
"use client";

import { useConfig } from "@replanejs/next";

export function ThemeToggle() {
  const theme = useConfig<{ darkMode: boolean }>("theme");
  return <div>{theme.darkMode ? "Dark Mode" : "Light Mode"}</div>;
}
```

### Pages Router

**1. Set up ReplaneProvider in _app.tsx:**

```tsx
// pages/_app.tsx
import type { AppContext, AppProps } from "next/app";
import App from "next/app";
import { ReplaneProvider, getReplaneSnapshot, type ReplaneSnapshot } from "@replanejs/next";

interface AppConfigs {
  theme: { darkMode: boolean; primaryColor: string };
  features: { betaEnabled: boolean };
}

interface AppPropsWithReplane extends AppProps {
  replaneSnapshot: ReplaneSnapshot<AppConfigs>;
}

export default function MyApp({ Component, pageProps, replaneSnapshot }: AppPropsWithReplane) {
  return (
    <ReplaneProvider
      snapshot={replaneSnapshot}
      options={{
        baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
        sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
      }}
    >
      <Component {...pageProps} />
    </ReplaneProvider>
  );
}

// Fetch Replane snapshot for all pages
MyApp.getInitialProps = async (appContext: AppContext) => {
  const appProps = await App.getInitialProps(appContext);

  const replaneSnapshot = await getReplaneSnapshot<AppConfigs>({
    baseUrl: process.env.REPLANE_BASE_URL!,
    sdkKey: process.env.REPLANE_SDK_KEY!,
  });

  return { ...appProps, replaneSnapshot };
};
```

**2. Use configs in any component:**

```tsx
// components/FeatureFlag.tsx
import { useConfig } from "@replanejs/next";

export function FeatureFlag() {
  const features = useConfig<{ betaEnabled: boolean }>("features");
  return features.betaEnabled ? <BetaFeature /> : null;
}
```

## Typed Hooks (Recommended)

For better type safety and autocomplete, create typed hooks for your application:

**1. Define your config types:**

```ts
// replane/types.ts
export interface AppConfigs {
  theme: {
    darkMode: boolean;
    primaryColor: string;
  };
  features: {
    betaEnabled: boolean;
    maxItems: number;
  };
}
```

**2. Create typed hooks:**

```ts
// replane/hooks.ts
import { createConfigHook, createReplaneHook } from "@replanejs/next";
import type { AppConfigs } from "./types";

// Typed hook for accessing individual configs
export const useAppConfig = createConfigHook<AppConfigs>();

// Typed hook for accessing the Replane client
export const useAppReplane = createReplaneHook<AppConfigs>();
```

**3. Use in components:**

```tsx
// components/ConfigDisplay.tsx
"use client";

import { useAppConfig, useAppReplane } from "@/replane/hooks";

export function ConfigDisplay() {
  // Config names autocomplete, values are fully typed
  const theme = useAppConfig("theme");
  // theme.darkMode is boolean, theme.primaryColor is string

  // Or use the client directly for more control
  const replane = useAppReplane();
  const snapshot = replane.getSnapshot();

  return <div style={{ color: theme.primaryColor }}>...</div>;
}
```

## API Reference

### Components

#### `ReplaneRoot`

Server component for App Router that fetches configs and provides them to the app.

```tsx
<ReplaneRoot<AppConfigs>
  options={{
    baseUrl: string;
    sdkKey: string;
    // ... other ReplaneClientOptions
  }}
>
  {children}
</ReplaneRoot>
```

#### `ReplaneProvider`

Client-side provider for Pages Router or custom setups.

```tsx
<ReplaneProvider
  snapshot={replaneSnapshot}
  options={{
    baseUrl: string;
    sdkKey: string;
  }}
>
  {children}
</ReplaneProvider>
```

### Hooks

#### `useConfig<T>(name: string): T`

Returns the value of a config by name. Re-renders when the config changes.

```tsx
const theme = useConfig<{ darkMode: boolean }>("theme");
```

#### `useReplane<T>(): ReplaneClient<T>`

Returns the Replane client instance for advanced usage.

```tsx
const client = useReplane<AppConfigs>();
const snapshot = client.getSnapshot();
const theme = client.get("theme");
```

#### `createConfigHook<T>()`

Creates a typed version of `useConfig` for your config schema.

```tsx
const useAppConfig = createConfigHook<AppConfigs>();
const theme = useAppConfig("theme"); // fully typed
```

#### `createReplaneHook<T>()`

Creates a typed version of `useReplane` for your config schema.

```tsx
const useAppReplane = createReplaneHook<AppConfigs>();
const client = useAppReplane(); // client.get("theme") is typed
```

### Functions

#### `getReplaneSnapshot<T>(options): Promise<ReplaneSnapshot<T>>`

Fetches a snapshot of all configs. Use in `getServerSideProps`, `getStaticProps`, or `getInitialProps`.

```tsx
const snapshot = await getReplaneSnapshot<AppConfigs>({
  baseUrl: process.env.REPLANE_BASE_URL!,
  sdkKey: process.env.REPLANE_SDK_KEY!,
  cacheTtlMs: 60_000, // optional, default 60 seconds
});
```

#### `clearSnapshotCache(): Promise<void>`

Clears the internal client cache. Useful for testing.

```tsx
await clearSnapshotCache();
```

## Environment Variables

```env
# Server-side only (for SSR/SSG)
REPLANE_BASE_URL=https://api.replane.io
REPLANE_SDK_KEY=your-sdk-key

# Client-side (for live updates)
NEXT_PUBLIC_REPLANE_BASE_URL=https://api.replane.io
NEXT_PUBLIC_REPLANE_SDK_KEY=your-sdk-key
```

## Examples

See the [examples](./examples) directory for complete working examples:

- **[next-app-router](./examples/next-app-router)** - App Router with ReplaneRoot
- **[next-pages-router](./examples/next-pages-router)** - Pages Router with getInitialProps

## License

MIT
