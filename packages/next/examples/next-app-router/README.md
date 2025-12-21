# Next.js App Router + Replane Example

This example demonstrates how to use `@replanejs/next` with Next.js App Router (React Server Components).

## Features

- Server-side config fetching with `ReplaneRoot`
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

## How It Works

### Server-Side (layout.tsx)

```tsx
import { ReplaneRoot } from "@replanejs/next/server";

export default async function RootLayout({ children }) {
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
```

### Client-Side (components)

```tsx
"use client";

import { useConfig } from "@replanejs/next";

export function MyComponent() {
  const theme = useConfig("theme");
  return <div>{theme.darkMode ? "Dark" : "Light"}</div>;
}
```

## Key Points

1. **ReplaneRoot**: Server component that fetches configs and provides them to children
2. **Hooks**: Use `useConfig` and `useReplane` in client components
3. **Environment variables**: Use `NEXT_PUBLIC_` prefix so variables are available on both server and client
