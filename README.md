# Replane JavaScript SDK

Small TypeScript client for fetching configuration values from a Replane API.

Part of the Replane project: [tilyupo/replane](https://github.com/tilyupo/replane).

> Status: early. Minimal surface area on purpose. Expect small breaking tweaks until 0.1.x.

## Why it exists

You just need: given a token + config name -> get the value. This package does only that, well:

- Works in ESM and CJS (dual build)
- Zero runtime deps (uses native `fetch` — bring a polyfill if your runtime lacks it)
- Tiny bundle footprint
- Strong TypeScript types
- Resilient to server errors (returns your fallback and logs)

## Installation

```bash
npm install replane-sdk
# or
pnpm add replane-sdk
# or
yarn add replane-sdk
```

## Quick start

```ts
import { createReplaneClient } from "replane-sdk";

const client = createReplaneClient({
  apiKey: process.env.REPLANE_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
});

// One-off fetch
const featureFlag = await client.getConfigValue<boolean>({
  name: "new-onboarding",
  fallback: false,
});

// Typed example
interface PasswordRequirements {
  minLength: number;
  requireSymbol: boolean;
}

const passwordRequirements = await client.getConfigValue<PasswordRequirements>({
  name: "password-requirements",
  fallback: { minLength: 8, requireSymbol: false },
});

// Watching a config
const billingEnabled = await client.watchConfigValue<boolean>({
  name: "billing-enabled",
  fallback: false,
});

// Later, read the latest value
if (billingEnabled.get()) {
  console.log("Billing enabled!");
}
```

## API

### `createReplaneClient(options)`

Returns an object: `{ getConfigValue, watchConfigValue }`.

#### Options

- `baseUrl` (string) – API origin (no trailing slash needed).
- `apiKey` (string) – API key for authorization. Required.
- `fetchFn` (function) – custom fetch (e.g. `undici.fetch` or mocked fetch in tests).
- `timeoutMs` (number) – abort the request after N ms. Default: 1000.
- `logger` (`{ info(...), error(...) }`) – optional logger (defaults to `console`).

### `client.getConfigValue({ name, fallback, ...overrides })`

Parameters:

- `name` (string) – config name to fetch.
- `fallback` (any) – value returned when request fails or response is invalid.
- Overrides: `baseUrl`, `apiKey`, `fetchFn`, `timeoutMs`, `logger` – same semantics as in `createReplaneClient`.

Returns: the config value (or the provided fallback on failure).

Failures (non-2xx, network error, or invalid JSON) do not throw; the function logs via `logger.error(...)` and returns your `fallback`.

### `client.watchConfigValue({ name, fallback, ...overrides })`

Creates a lightweight watcher that refreshes the config value in the background. Useful for long‑lived processes wanting near‑real‑time updates without manually refetching.

Returns a promise resolving to `{ get(): T }` where `get()` returns the current value. Until the first successful fetch it returns the provided fallback. Errors during refresh reuse the last known value.

### Errors

This SDK doesn't throw on request/response errors during `getConfigValue` or background refreshes in `watchConfigValue`. Instead, it logs (using the provided or default logger) and returns the provided `fallback` (or previous value for watchers).

## Environment notes

- Node 18+ has global `fetch`; for older Node versions supply `fetchFn`.
- Edge runtimes / Workers: provide a compatible `fetch` + `AbortController` if not built‑in.

## Common patterns

Typed config:

```ts
interface LayoutConfig {
  variant: "a" | "b";
  ttl: number;
}
const layout = await client.getConfigValue<LayoutConfig>({
  name: "layout",
  fallback: { variant: "a", ttl: 0 },
});
```

Timeout override:

```ts
await client.getConfigValue({
  name: "slow-config",
  fallback: null,
  timeoutMs: 1500,
});
```

Custom fetch (tests):

```ts
const client = createReplaneClient({
  apiKey: "TKN",
  baseUrl: "https://api",
  fetchFn: mockFetch,
});
```

## Roadmap

- Config caching
- Config invalidation

## License

MIT
