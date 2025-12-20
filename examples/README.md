# Examples

This directory contains example projects demonstrating how to use the Replane JavaScript SDKs.

Each example is an **independent project** that uses packages from npm (not workspace dependencies). This allows you to copy any example as a starting point for your own project.

## Available Examples

### [sdk](./sdk)

A Node.js example using `@replanejs/sdk` directly. Demonstrates:
- Type-safe config access
- Real-time subscription to config changes
- Context-based override evaluation

### [react](./react)

A React + Vite example using `@replanejs/react`. Demonstrates:
- `ReplaneProvider` with Suspense
- `useConfig` hook for reactive config values
- Fallback values for offline scenarios

### [next](./next)

A Next.js App Router example using `@replanejs/next`. Demonstrates:
- Server-side config fetching with `getReplaneSnapshot()`
- Zero-loading-state hydration
- Real-time updates after SSR

## Running an Example

1. Navigate to the example directory:
   ```bash
   cd examples/sdk  # or react, next
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (see each example's README)

4. Run the example:
   ```bash
   npm start  # sdk
   npm run dev  # react, next
   ```
