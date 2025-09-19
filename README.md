# Replane JavaScript SDK

Small TypeScript client for fetching configuration values from a Replane API.

Part of the Replane project: [replane-dev/replane](https://github.com/replane-dev/replane).

> Status: early. Minimal surface area on purpose. Expect small breaking tweaks until 0.1.x.

## Why it exists

You just need: given a token + config name -> get the value. This package does only that:

- Works in ESM and CJS (dual build)
- Zero runtime deps (uses native `fetch` — bring a polyfill if your runtime lacks it)
- Tiny bundle footprint
- Strong TypeScript types

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

const featureFlag = await client
  .getConfigValue<boolean>("new-onboarding")
  // Ignore errors and use `false` if config is missing or fetch fails
  .catch(() => false);

// Typed example
interface PasswordRequirements {
  minLength: number;
  requireSymbol: boolean;
}

const passwordRequirements = await client
  .getConfigValue<PasswordRequirements>("password-requirements")
  .catch(() => ({ minLength: 8, requireSymbol: false }));

// Watching a config (initial fetch must succeed)
const billingEnabled = await client.watchConfigValue<boolean>(
  "billing-enabled"
);

// Later, read the latest value
if (billingEnabled.get()) {
  console.log("Billing enabled!");
}

// When done, clean up resources
billingEnabled.close();

// Or, if you don't need the client anymore
client.close();
```

## API

### `createReplaneClient(options)`

Returns an object: `{ getConfigValue, watchConfigValue, close }`.

`close()` stops all active watchers created by this client and marks the client as closed. After calling it, any subsequent call to `getConfigValue` or `watchConfigValue` will throw. It is safe to call multiple times (no‑op after the first call).

#### Options

- `baseUrl` (string) – API origin (no trailing slash needed).
- `apiKey` (string) – API key for authorization. Required.
- `fetchFn` (function) – custom fetch (e.g. `undici.fetch` or mocked fetch in tests).
- `timeoutMs` (number) – abort the request after N ms. Default: 5000.

### `client.getConfigValue(name, overrides?)`

Parameters:

- `name` (string) – config name to fetch.
- Overrides: `baseUrl`, `apiKey`, `fetchFn`, `timeoutMs` – same semantics as in `createReplaneClient`.

Returns: a promise resolving to the parsed JSON value.

Errors: throws on non-2xx responses (including 404 for missing configs), network errors, or invalid JSON. Catch `ReplaneError` to handle failures.

### `client.watchConfigValue(name, overrides?)`

Creates a lightweight watcher that refreshes the config value in the background (every 60 seconds). Useful for long‑lived processes wanting near‑real‑time updates without manually refetching.

Returns a promise resolving to an object: `{ get(): T, close(): void }`.

- `get()` – returns the most recent value.
- `close()` – stops the periodic refresh for just this watcher. Further calls to `get()` after `close()` throw.

Notes:

- The initial fetch must succeed (it will throw on errors).
- Subsequent periodic refreshes update the stored value on success.

#### Watcher lifecycle

- All watchers created by a client are automatically closed when you call `client.close()`.
- You can individually stop watching a value by calling `watcher.close()`.
- Closing an already closed watcher is a no‑op.

Example:

```ts
const billingEnabled = await client.watchConfigValue("billing-enabled");
if (billingEnabled.get()) {
  // ...
}
// Later, when you no longer need updates:
billingEnabled.close();
```

### `client.close()`

Gracefully shuts down the client, closing all active config watchers. Subsequent method calls will throw. Use this in environments where you manage resource lifecycles explicitly (e.g. shutting down a server or worker).

```ts
// During shutdown
client.close();
```

### Errors

`getConfigValue` throws on non‑2xx HTTP responses (including 404), network errors, and invalid JSON. `watchConfigValue` uses `getConfigValue` for its initial fetch; handle errors accordingly with try/catch when creating a watcher. A `ReplaneError` is thrown for HTTP failures; other errors may be thrown for network/parse issues.

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
const layout = await client.getConfigValue<LayoutConfig>("layout");
```

Timeout override:

```ts
await client.getConfigValue("slow-config", { timeoutMs: 1500 });
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
