# @replanejs/sdk - Deno Example

A Deno example demonstrating how to use `@replanejs/sdk` for dynamic configuration with real-time updates.

## Requirements

- [Deno](https://deno.land/) v1.37.0 or later (npm specifier support)

## Running

Set the required environment variables and run:

```bash
REPLANE_SDK_KEY=your-sdk-key \
REPLANE_BASE_URL=https://replane.example.com \
deno task start
```

Or run directly:

```bash
REPLANE_SDK_KEY=your-sdk-key \
REPLANE_BASE_URL=https://replane.example.com \
deno run --allow-net --allow-env src/index.ts
```

## Required Permissions

- `--allow-net` - Required for HTTP requests to Replane API and SSE connections
- `--allow-env` - Required to read environment variables

## What this example demonstrates

- Creating a type-safe Replane client with Deno
- Getting config values with TypeScript inference
- Using context for user-specific config evaluation
- Subscribing to real-time config updates
- Graceful shutdown handling with Deno signals

## Why Deno?

Deno provides secure-by-default execution with explicit permissions, native TypeScript support, and npm compatibility via the `npm:` specifier. The SDK works seamlessly with Deno's runtime.
