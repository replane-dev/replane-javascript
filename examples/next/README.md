# @replanejs/next Example

A Next.js App Router example demonstrating how to use `@replanejs/next` for server-side rendered feature flags with real-time updates.

## Setup

```bash
npm install
```

## Running

Create a `.env.local` file with your Replane credentials:

```env
# Server-side (not exposed to client)
REPLANE_BASE_URL=https://replane.example.com
REPLANE_SDK_KEY=your-sdk-key

# Client-side (exposed via NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_REPLANE_BASE_URL=https://replane.example.com
NEXT_PUBLIC_REPLANE_SDK_KEY=your-sdk-key
```

Then start the development server:

```bash
npm run dev
```

## What this example demonstrates

- Server-side config fetching with `getReplaneSnapshot()`
- Zero-loading-state hydration with `ReplaneNextProvider`
- `useConfig` hook for reactive client components
- Real-time updates via SSE after hydration
- Type-safe configuration with TypeScript
- Context-based override evaluation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Server (RSC)                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  getReplaneSnapshot()                                 │  │
│  │  - Fetches configs from Replane API                   │  │
│  │  - Returns serializable snapshot                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ snapshot (serialized)
┌─────────────────────────────────────────────────────────────┐
│                    Client                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  ReplaneNextProvider                                  │  │
│  │  - Restores client from snapshot (instant)            │  │
│  │  - Connects to Replane for real-time updates          │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  useConfig() / useReplane()                           │  │
│  │  - Access configs in any client component             │  │
│  │  - Auto re-render on config changes                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```
