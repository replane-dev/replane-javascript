# @replanejs/sdk - Browser Example

A browser example demonstrating how to use `@replanejs/sdk` for dynamic configuration with real-time updates in the browser.

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

Without credentials, the example will use an in-memory client with demo data.

## Building for Production

```bash
npm run build
npm run preview
```

## What this example demonstrates

- Creating a Replane client in the browser
- Getting config values with type safety
- Using context for user-specific config evaluation
- Real-time updates via SSE with visual feedback
- Proper cleanup on page unload
- Fallback to in-memory client for demo purposes

## Browser Compatibility

The SDK uses standard web APIs:
- `fetch` for HTTP requests
- `EventSource` for SSE connections

These are supported in all modern browsers. For older browsers, you may need polyfills.
