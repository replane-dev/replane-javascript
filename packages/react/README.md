# @replanejs/react

React SDK for [Replane](https://github.com/replane-dev/replane-javascript) - feature flags and remote configuration.

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
import { ReplaneProvider, useConfig } from '@replanejs/react';

function App() {
  return (
    <ReplaneProvider
      options={{
        baseUrl: 'https://your-replane-server.com',
        sdkKey: 'your-sdk-key',
      }}
      loader={<div>Loading...</div>}
    >
      <MyComponent />
    </ReplaneProvider>
  );
}

function MyComponent() {
  const isFeatureEnabled = useConfig<boolean>('feature-flag-name');

  return (
    <div>
      {isFeatureEnabled ? 'Feature is enabled!' : 'Feature is disabled'}
    </div>
  );
}
```

## API

### ReplaneProvider

Provider component that makes the Replane client available to your component tree. Supports three usage patterns:

#### 1. With options (recommended)

The provider creates and manages the client internally:

```tsx
<ReplaneProvider
  options={{
    baseUrl: 'https://your-replane-server.com',
    sdkKey: 'your-sdk-key',
  }}
  loader={<LoadingSpinner />}
  onError={(error) => console.error('Failed to initialize:', error)}
>
  <App />
</ReplaneProvider>
```

#### 2. With pre-created client

Use this when you need more control over client lifecycle:

```tsx
import { createReplaneClient } from '@replanejs/sdk';

const client = await createReplaneClient({
  baseUrl: 'https://your-replane-server.com',
  sdkKey: 'your-sdk-key',
});

<ReplaneProvider client={client}>
  <App />
</ReplaneProvider>
```

#### 3. With Suspense

Integrates with React Suspense for loading states:

```tsx
<Suspense fallback={<LoadingSpinner />}>
  <ReplaneProvider
    options={{
      baseUrl: 'https://your-replane-server.com',
      sdkKey: 'your-sdk-key',
    }}
    suspense
  >
    <App />
  </ReplaneProvider>
</Suspense>
```

### useConfig

Hook to retrieve a configuration value. Automatically subscribes to updates and re-renders when the value changes.

```tsx
function MyComponent() {
  // Basic usage
  const theme = useConfig<string>('theme');

  // With evaluation context
  const discount = useConfig<number>('discount-percentage', {
    context: {
      userId: '123',
      isPremium: true,
    },
  });

  return <div>Theme: {theme}, Discount: {discount}%</div>;
}
```

### useReplane

Hook to access the underlying Replane client directly:

```tsx
function MyComponent() {
  const { client } = useReplane();

  const handleClick = () => {
    // Access client methods directly
    const value = client.get('some-config');
    console.log(value);
  };

  return <button onClick={handleClick}>Get Config</button>;
}
```

### clearSuspenseCache

Utility function to clear the suspense cache. Useful for testing or forcing re-initialization:

```tsx
import { clearSuspenseCache } from '@replanejs/react';

// Clear cache for specific options
clearSuspenseCache({
  baseUrl: 'https://your-replane-server.com',
  sdkKey: 'your-sdk-key',
});

// Clear entire cache
clearSuspenseCache();
```

## TypeScript

The SDK is fully typed. You can provide a type parameter to get type-safe configuration values:

```tsx
interface MyConfig {
  theme: 'light' | 'dark';
  maxItems: number;
  features: {
    analytics: boolean;
    notifications: boolean;
  };
}

// Type-safe hooks
const { client } = useReplane<MyConfig>();
const theme = useConfig<MyConfig['theme']>('theme');
```

## License

MIT
