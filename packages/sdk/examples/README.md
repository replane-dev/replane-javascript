# @replanejs/sdk Examples

Examples demonstrating how to use `@replanejs/sdk` across different JavaScript runtimes.

## Runtime Examples

| Runtime     | Directory                | Description                          |
| ----------- | ------------------------ | ------------------------------------ |
| **Node.js** | [`node/`](./node/)       | Server-side Node.js with TypeScript  |
| **Bun**     | [`bun/`](./bun/)         | Native TypeScript execution with Bun |
| **Deno**    | [`deno/`](./deno/)       | Secure runtime with Deno             |
| **Browser** | [`browser/`](./browser/) | Client-side browser app with Vite    |

## Framework SDKs

For React, Next.js, and Svelte applications, use the dedicated framework SDKs which provide hooks, context providers, and SSR support:

| Framework   | Package             | Examples                                              |
| ----------- | ------------------- | ----------------------------------------------------- |
| **React**   | `@replanejs/react`  | [`packages/react/examples/`](../../react/examples/)   |
| **Next.js** | `@replanejs/next`   | [`packages/next/examples/`](../../next/examples/)     |
| **Svelte**  | `@replanejs/svelte` | [`packages/svelte/examples/`](../../svelte/examples/) |

## Quick Start

Each example includes its own README with specific instructions. Generally:

### Node.js

```bash
cd node
npm install
REPLANE_SDK_KEY=your-key REPLANE_BASE_URL=https://replane.example.com npm start
```

### Bun

```bash
cd bun
bun install
REPLANE_SDK_KEY=your-key REPLANE_BASE_URL=https://replane.example.com bun start
```

### Deno

```bash
cd deno
REPLANE_SDK_KEY=your-key REPLANE_BASE_URL=https://replane.example.com deno task start
```

### Browser

```bash
cd browser
npm install
# Create .env file with VITE_REPLANE_SDK_KEY and VITE_REPLANE_BASE_URL
npm run dev
```

## Features Demonstrated

All examples show:

- Creating a type-safe Replane client
- Getting config values with TypeScript inference
- Using context for user-specific config evaluation
- Subscribing to real-time config updates via SSE
- Graceful shutdown/cleanup handling
- Default values for offline/error scenarios
