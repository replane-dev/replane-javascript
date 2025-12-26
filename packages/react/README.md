# @replanejs/react

[![npm](https://img.shields.io/npm/v/@replanejs/react)](https://www.npmjs.com/package/@replanejs/react)
[![License](https://img.shields.io/github/license/replane-dev/replane-javascript)](https://github.com/replane-dev/replane-javascript/blob/main/LICENSE)
[![Community](https://img.shields.io/badge/discussions-join-blue?logo=github)](https://github.com/orgs/replane-dev/discussions)

React SDK for [Replane](https://github.com/replane-dev/replane) - feature flags and remote configuration.

## Installation

```bash
npm install @replanejs/react
# or
pnpm add @replanejs/react
# or
yarn add @replanejs/react
```

## Requirements

- React 18.0.0 or higher
- Node.js 18.0.0 or higher

## Quick Start

```tsx
import { ReplaneProvider, useConfig } from "@replanejs/react";

function App() {
  return (
    <ReplaneProvider
      options={{
        baseUrl: "https://your-replane-server.com",
        sdkKey: "your-sdk-key",
      }}
      loader={<div>Loading...</div>}
    >
      <MyComponent />
    </ReplaneProvider>
  );
}

function MyComponent() {
  const isFeatureEnabled = useConfig<boolean>("feature-flag-name");

  return <div>{isFeatureEnabled ? "Feature is enabled!" : "Feature is disabled"}</div>;
}
```

## API

### ReplaneProvider

Provider component that makes the Replane client available to your component tree. Supports four usage patterns:

#### 1. With options (recommended)

The provider creates and manages the client internally. Use an Error Boundary to handle initialization errors:

```tsx
import { ErrorBoundary } from "react-error-boundary";

<ErrorBoundary fallback={<div>Failed to load configuration</div>}>
  <ReplaneProvider
    options={{
      baseUrl: "https://your-replane-server.com",
      sdkKey: "your-sdk-key",
    }}
    loader={<LoadingSpinner />}
  >
    <App />
  </ReplaneProvider>
</ErrorBoundary>;
```

#### Client Options

The `options` prop accepts the following options:

| Option               | Type                  | Required | Description                                  |
| -------------------- | --------------------- | -------- | -------------------------------------------- |
| `baseUrl`            | `string`              | Yes      | Replane server URL                           |
| `sdkKey`             | `string`              | Yes      | SDK key for authentication                   |
| `context`            | `Record<string, any>` | No       | Default context for override evaluations     |
| `defaults`           | `Record<string, any>` | No       | Default values if server is unavailable      |
| `connectTimeoutMs`   | `number`              | No       | SDK connection timeout (default: 5000)       |
| `requestTimeoutMs`   | `number`              | No       | Timeout for SSE requests (default: 2000)     |
| `retryDelayMs`       | `number`              | No       | Base delay between retries (default: 200)    |
| `inactivityTimeoutMs`| `number`              | No       | SSE inactivity timeout (default: 30000)      |
| `fetchFn`            | `typeof fetch`        | No       | Custom fetch implementation                  |
| `logger`             | `ReplaneLogger`       | No       | Custom logger (default: console)             |

See [`@replanejs/sdk` documentation](https://github.com/replane-dev/replane-javascript/tree/main/packages/sdk#api) for more details.

#### 2. With pre-created client

Use this when you need more control over client lifecycle:

```tsx
import { Replane } from "@replanejs/sdk";

const client = new Replane();
await client.connect({
  baseUrl: "https://your-replane-server.com",
  sdkKey: "your-sdk-key",
});

<ReplaneProvider client={client}>
  <App />
</ReplaneProvider>;
```

#### 3. With Suspense

Integrates with React Suspense for loading states:

```tsx
<ErrorBoundary fallback={<div>Failed to load configuration</div>}>
  <Suspense fallback={<LoadingSpinner />}>
    <ReplaneProvider
      options={{
        baseUrl: "https://your-replane-server.com",
        sdkKey: "your-sdk-key",
      }}
      suspense
    >
      <App />
    </ReplaneProvider>
  </Suspense>
</ErrorBoundary>
```

#### 4. With snapshot (for SSR/hydration)

Restore a client from a snapshot obtained on the server. This is synchronous and useful for SSR scenarios:

```tsx
// On the server
const serverClient = new Replane();
await serverClient.connect({ baseUrl: "...", sdkKey: "..." });
const snapshot = serverClient.getSnapshot();
// Pass snapshot to client via props, context, or serialized HTML

// On the client
<ReplaneProvider
  options={{
    baseUrl: "https://your-replane-server.com",
    sdkKey: "your-sdk-key",
  }}
  snapshot={snapshot}
>
  <App />
</ReplaneProvider>;
```

The restored client is immediately available with no loading state. The provider will establish a connection for real-time updates in the background.

### useConfig

Hook to retrieve a configuration value. Automatically subscribes to updates and re-renders when the value changes.

```tsx
function MyComponent() {
  // Basic usage
  const theme = useConfig<string>("theme");

  // With evaluation context
  const discount = useConfig<number>("discount-percentage", {
    context: {
      userId: "123",
      isPremium: true,
    },
  });

  return (
    <div>
      Theme: {theme}, Discount: {discount}%
    </div>
  );
}
```

### useReplane

Hook to access the underlying Replane client directly. Returns the client instance:

```tsx
function MyComponent() {
  const replane = useReplane();

  const handleClick = () => {
    // Access replane methods directly
    const value = replane.get("some-config");
    console.log(value);
  };

  return <button onClick={handleClick}>Get Config</button>;
}
```

### createReplaneHook

Factory function to create a typed version of `useReplane`. Returns a hook that provides the typed client directly:

```tsx
import { createReplaneHook } from "@replanejs/react";

// Define your config types
interface AppConfigs {
  theme: { darkMode: boolean; primaryColor: string };
  features: { beta: boolean; analytics: boolean };
  maxItems: number;
}

// Create a typed hook
const useAppReplane = createReplaneHook<AppConfigs>();

function MyComponent() {
  const replane = useAppReplane();

  // replane.get is now typed - autocomplete works!
  const theme = replane.get("theme");
  //    ^? { darkMode: boolean; primaryColor: string }

  return <div>Dark mode: {theme.darkMode ? "on" : "off"}</div>;
}
```

### createConfigHook

Factory function to create a typed version of `useConfig`. This provides autocomplete for config names and type inference for values:

```tsx
import { createConfigHook } from "@replanejs/react";

// Define your config types
interface AppConfigs {
  theme: { darkMode: boolean; primaryColor: string };
  features: { beta: boolean; analytics: boolean };
  maxItems: number;
}

// Create a typed hook
const useAppConfig = createConfigHook<AppConfigs>();

function MyComponent() {
  // Autocomplete for config names, automatic type inference
  const theme = useAppConfig("theme");
  //    ^? { darkMode: boolean; primaryColor: string }

  const features = useAppConfig("features");
  //    ^? { beta: boolean; analytics: boolean }

  const maxItems = useAppConfig("maxItems");
  //    ^? number

  // With context override
  const premiumFeatures = useAppConfig("features", {
    context: { userId: "123", plan: "premium" },
  });

  return (
    <div>
      <p>Dark mode: {theme.darkMode ? "on" : "off"}</p>
      <p>Beta enabled: {features.beta ? "yes" : "no"}</p>
      <p>Max items: {maxItems}</p>
    </div>
  );
}
```

### clearSuspenseCache

Utility function to clear the suspense cache. Useful for testing or forcing re-initialization:

```tsx
import { clearSuspenseCache } from "@replanejs/react";

// Clear cache for specific options
clearSuspenseCache({
  baseUrl: "https://your-replane-server.com",
  sdkKey: "your-sdk-key",
});

// Clear entire cache
clearSuspenseCache();
```

## TypeScript

The SDK is fully typed. For the best TypeScript experience, use the hook factory functions:

```tsx
// Define all your config types in one interface
interface AppConfigs {
  "theme-config": {
    darkMode: boolean;
    primaryColor: string;
  };
  "feature-flags": {
    newUI: boolean;
    beta: boolean;
  };
  "max-items": number;
  "welcome-message": string;
}

// Create typed hooks once
const useAppReplane = createReplaneHook<AppConfigs>();
const useAppConfig = createConfigHook<AppConfigs>();

// Use throughout your app with full type safety
function Settings() {
  const theme = useAppConfig("theme-config");
  //    ^? { darkMode: boolean; primaryColor: string }

  const replane = useAppReplane();
  const snapshot = replane.getSnapshot();
  //    ^? { configs: ConfigSnapshot<AppConfigs>[] }

  return (
    <div style={{ color: theme.primaryColor }}>
      Dark mode: {theme.darkMode ? "enabled" : "disabled"}
    </div>
  );
}
```

## Error Handling

The provider throws errors during rendering so they can be caught by React Error Boundaries:

```tsx
import { Component, ReactNode } from "react";

class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Usage
<ErrorBoundary fallback={<div>Configuration failed to load</div>}>
  <ReplaneProvider options={options} loader={<Loading />}>
    <App />
  </ReplaneProvider>
</ErrorBoundary>;
```

Or use a library like `react-error-boundary`:

```tsx
import { ErrorBoundary } from "react-error-boundary";

<ErrorBoundary
  fallbackRender={({ error, resetErrorBoundary }) => (
    <div>
      <p>Error: {error.message}</p>
      <button onClick={resetErrorBoundary}>Retry</button>
    </div>
  )}
  onReset={() => clearSuspenseCache()}
>
  <ReplaneProvider options={options} loader={<Loading />}>
    <App />
  </ReplaneProvider>
</ErrorBoundary>;
```

## Community

Have questions or want to discuss Replane? Join the conversation in [GitHub Discussions](https://github.com/orgs/replane-dev/discussions).

## License

MIT
