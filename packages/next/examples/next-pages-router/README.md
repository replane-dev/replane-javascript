# Next.js Pages Router + Replane Example

This example demonstrates how to use `@replanejs/next` with Next.js Pages Router.

## Features

- Server-side config fetching via getServerSideProps
- Static generation with ISR via getStaticProps
- Client hydration with no flash of unstyled content
- Real-time config updates via SSE
- Full TypeScript support with typed hooks

## Setup

1. Copy the environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Update the environment variables with your Replane credentials.

3. Install dependencies:
   ```bash
   pnpm install
   ```

4. Run the development server:
   ```bash
   pnpm dev
   ```

## Pages

- `/` - Server-side rendering with getServerSideProps
- `/static` - Static generation with ISR (getStaticProps)

## How It Works

### _app.tsx (Provider Setup)

```tsx
import { ReplaneProvider, type ReplaneSnapshot } from "@replanejs/next";

export default function App({ Component, pageProps }) {
  return (
    <ReplaneProvider
      snapshot={pageProps.replaneSnapshot}
      options={{
        baseUrl: process.env.NEXT_PUBLIC_REPLANE_BASE_URL!,
        sdkKey: process.env.NEXT_PUBLIC_REPLANE_SDK_KEY!,
      }}
    >
      <Component {...pageProps} />
    </ReplaneProvider>
  );
}
```

### getServerSideProps

```tsx
import { getReplaneSnapshot } from "@replanejs/next";

export const getServerSideProps = async () => {
  const snapshot = await getReplaneSnapshot({
    baseUrl: process.env.REPLANE_BASE_URL!,
    sdkKey: process.env.REPLANE_SDK_KEY!,
  });

  return {
    props: { replaneSnapshot: snapshot },
  };
};
```

### getStaticProps with ISR

```tsx
import { getReplaneSnapshot } from "@replanejs/next";

export const getStaticProps = async () => {
  const snapshot = await getReplaneSnapshot({
    baseUrl: process.env.REPLANE_BASE_URL!,
    sdkKey: process.env.REPLANE_SDK_KEY!,
  });

  return {
    props: { replaneSnapshot: snapshot },
    revalidate: 60, // ISR: revalidate every 60 seconds
  };
};
```

### Using Configs in Components

```tsx
import { useConfig } from "@replanejs/next";

export function MyComponent() {
  const theme = useConfig("theme");
  return <div>{theme.darkMode ? "Dark" : "Light"}</div>;
}
```

## Key Points

1. **Single import**: Use `@replanejs/next` for all imports
2. **Environment variables**: Use `NEXT_PUBLIC_` prefix for client-side variables
3. **Snapshot**: Pass `snapshot` from SSR to hydrate the client without flicker
