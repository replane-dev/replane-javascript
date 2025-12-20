# @replanejs/sdk Example

A simple Node.js example demonstrating how to use `@replanejs/sdk` for dynamic configuration with real-time updates.

## Setup

```bash
npm install
```

## Running

Set the required environment variables and run:

```bash
REPLANE_SDK_KEY=your-sdk-key \
REPLANE_BASE_URL=https://replane.example.com \
npm start
```

## What this example demonstrates

- Creating a type-safe Replane client
- Getting config values with TypeScript inference
- Using context for user-specific config evaluation
- Subscribing to real-time config updates
- Graceful shutdown handling
