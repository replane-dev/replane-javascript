# @replanejs/react Example

A React + Vite example demonstrating how to use `@replanejs/react` for dynamic configuration with real-time updates.

## Setup

```bash
npm install
```

## Running

Create a `.env` file with your Replane credentials:

```env
VITE_REPLANE_SDK_KEY=your-sdk-key
VITE_REPLANE_BASE_URL=https://replane.example.com
```

Then start the development server:

```bash
npm run dev
```

## What this example demonstrates

- `ReplaneProvider` with Suspense for loading states
- `useConfig` hook for reactive config values
- `useReplane` hook for direct client access
- Type-safe configuration with TypeScript
- Real-time updates via SSE
- Context-based override evaluation
- Fallback values for offline/error scenarios
