# @replanejs/sdk - Bun Example

A Bun example demonstrating how to use `@replanejs/sdk` for dynamic configuration with real-time updates.

## Requirements

- [Bun](https://bun.sh/) v1.0.0 or later

## Setup

```bash
bun install
```

## Running

Set the required environment variables and run:

```bash
REPLANE_SDK_KEY=your-sdk-key \
REPLANE_BASE_URL=https://replane.example.com \
bun start
```

## What this example demonstrates

- Creating a type-safe Replane client with Bun
- Getting config values with TypeScript inference
- Using context for user-specific config evaluation
- Subscribing to real-time config updates
- Graceful shutdown handling

## Why Bun?

Bun provides native TypeScript support without transpilation, making it ideal for running `@replanejs/sdk` examples directly. The SDK works seamlessly with Bun's runtime.
