# Replane JavaScript SDK

Small TypeScript client for watching configuration values from a Replane API with realtime updates and context-based override evaluation.

Part of the Replane project: [replane-dev/replane](https://github.com/replane-dev/replane).

> Status: early. Minimal surface area on purpose. Expect small breaking tweaks until 0.1.x.

## Why it exists

You need: given a token + config name + optional context -> watch the value with realtime updates. This package does only that:

- Works in ESM and CJS (dual build)
- Zero runtime deps (uses native `fetch` — bring a polyfill if your runtime lacks it)
- Realtime updates via Server-Sent Events (SSE)
- Context-based override evaluation (feature flags, A/B testing, gradual rollouts)
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

> **Important:** Each API key is tied to a specific project. The client can only access configs from the project that the API key belongs to. If you need configs from multiple projects, create separate API keys and initialize separate clients—one per project.

```ts
import { createReplaneClient } from "replane-sdk";

const client = createReplaneClient({
  // Each API key belongs to one project only
  apiKey: process.env.REPLANE_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
});

// Watch a config (receives realtime updates via SSE)
const featureFlag = await client.watchConfig<boolean>("new-onboarding");

// Get the current value
if (featureFlag.getValue()) {
  console.log("New onboarding enabled!");
}

// Typed example
interface PasswordRequirements {
  minLength: number;
  requireSymbol: boolean;
}

const passwordReqs = await client.watchConfig<PasswordRequirements>(
  "password-requirements"
);

// Read value anytime (always returns the latest from realtime updates)
const { minLength } = passwordReqs.getValue();

// With context for override evaluation
const billingEnabled = await client.watchConfig<boolean>("billing-enabled");

// Evaluate with user context - overrides apply automatically
const enabled = billingEnabled.getValue({
  userId: "user-123",
  plan: "premium",
  region: "us-east",
});

// When done, clean up resources
featureFlag.close();
passwordReqs.close();
billingEnabled.close();

// Or close all watchers at once
client.close();
```

## API

### `createReplaneClient(options)`

Returns an object: `{ watchConfig, close }`.

`close()` stops all active watchers created by this client and marks the client as closed. After calling it, any subsequent call to `watchConfig` will throw. It is safe to call multiple times (no‑op after the first call).

#### Options

- `baseUrl` (string) – API origin (no trailing slash needed).
- `apiKey` (string) – API key for authorization. Required. **Note:** Each API key is tied to a specific project and can only access configs from that project. To access configs from multiple projects, create multiple API keys and initialize separate client instances.
- `context` (object) – default context for all config evaluations. Can be overridden per-request in `watcher.getValue()`. Optional.
- `fetchFn` (function) – custom fetch (e.g. `undici.fetch` or mocked fetch in tests). Optional.
- `timeoutMs` (number) – abort the request after N ms. Default: 2000.
- `retries` (number) – number of retry attempts on failures (5xx or network errors). Default: 2.
- `retryDelayMs` (number) – base delay between retries in ms (a small jitter is applied). Default: 200.
- `logger` (object) – custom logger with `debug`, `info`, `warn`, `error` methods. Default: `console`.

### `client.watchConfig(name, options?)`

Creates a lightweight watcher that receives realtime updates for the config value via Server-Sent Events (SSE). Useful for long‑lived processes wanting instant updates without manually refetching.

Parameters:

- `name` (string) – config name to watch.
- `options` (object) – optional configuration:
  - `context` (object) – context merged with client-level context for override evaluation.

Returns a promise resolving to an object: `{ getValue(context?): T, close(): void }`.

- `getValue(context?)` – returns the current value with override evaluation based on provided context (merged with client and watcher contexts). The value is always up-to-date thanks to realtime SSE updates.
- `close()` – stops watching for updates. Further calls to `getValue()` after `close()` throw.

Notes:

- The initial fetch must succeed (it will throw on errors).
- Subsequent updates are pushed from the server in realtime via SSE.
- Values are automatically refreshed every 60 seconds as a fallback.

#### Watcher lifecycle

- All watchers created by a client are automatically closed when you call `client.close()`.
- You can individually stop watching a value by calling `watcher.close()`.
- Closing an already closed watcher is a no‑op.

Example:

```ts
const billingEnabled = await client.watchConfig<boolean>("billing-enabled");

// Get value without context values
if (billingEnabled.getValue()) {
  // ...
}

// Get value with context for override evaluation
if (billingEnabled.getValue({ userId: "user-123", plan: "premium" })) {
  // ...
}

// Later, when you no longer need updates:
billingEnabled.close();
```

### `createInMemoryReplaneClient(initialData)`

Creates a client backed by an in-memory store instead of making HTTP requests. Handy for unit tests or local development where you want deterministic config values without a server.

Parameters:

- `initialData` (object) – map of config name to value.

Returns the same client shape as `createReplaneClient` (`{ watchConfig, close }`).

Notes:

- `watchConfig(name)` resolves to a watcher with the value from `initialData`.
- If a name is missing, it throws a `ReplaneError` (`Config not found: <name>`).
- Watchers work as usual but don't receive SSE updates (values remain whatever is in-memory).

Example:

```ts
import { createInMemoryReplaneClient } from "replane-sdk";

const client = createInMemoryReplaneClient({
  "feature-a": true,
  "max-items": { value: 10, ttl: 3600 },
});

const featureA = await client.watchConfig<boolean>("feature-a");
console.log(featureA.getValue()); // true

const maxItems = await client.watchConfig<{ value: number; ttl: number }>(
  "max-items"
);
console.log(maxItems.getValue()); // { value: 10, ttl: 3600 }

featureA.close();
maxItems.close();
```

### `client.close()`

Gracefully shuts down the client, closing all active config watchers. Subsequent method calls will throw. Use this in environments where you manage resource lifecycles explicitly (e.g. shutting down a server or worker).

```ts
// During shutdown
client.close();
```

### Errors

`watchConfig` throws on non‑2xx HTTP responses (including 404), network errors, and invalid JSON during the initial fetch. Handle errors with try/catch when creating a watcher. A `ReplaneError` is thrown for HTTP failures; other errors may be thrown for network/parse issues.

After the initial fetch succeeds, subsequent SSE update errors are logged but don't throw (the watcher continues to work with the last known value).

## Environment notes

- Node 18+ has global `fetch`; for older Node versions supply `fetchFn`.
- Edge runtimes / Workers: provide a compatible `fetch` + `AbortController` if not built‑in.

## Common patterns

### Typed config

```ts
interface LayoutConfig {
  variant: "a" | "b";
  ttl: number;
}
const layout = await client.watchConfig<LayoutConfig>("layout");
console.log(layout.getValue()); // { variant: "a", ttl: 3600 }
```

### Context-based overrides

```ts
// Config has base value `false` but override: if `plan === "premium"` then `true`
const featureWatcher = await client.watchConfig<boolean>("advanced-features");

// Free user
const freeUserEnabled = featureWatcher.getValue({ plan: "free" }); // false

// Premium user
const premiumUserEnabled = featureWatcher.getValue({ plan: "premium" }); // true
```

### Client-level context

```ts
const client = createReplaneClient({
  apiKey: process.env.REPLANE_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
  context: {
    environment: "production",
    region: "us-east",
  },
});

// This context is used for all watchers unless overridden
const watcher = await client.watchConfig("feature-flag");
watcher.getValue(); // Uses client-level context
watcher.getValue({ userId: "123" }); // Merges with client context
```

### Custom fetch (tests)

```ts
const client = createReplaneClient({
  apiKey: "TKN",
  baseUrl: "https://api",
  fetchFn: mockFetch,
});
```

### Multiple projects

```ts
// Each project needs its own API key and client instance
const projectAClient = createReplaneClient({
  apiKey: process.env.PROJECT_A_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
});

const projectBClient = createReplaneClient({
  apiKey: process.env.PROJECT_B_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
});

// Each client only accesses configs from its respective project
const featureA = await projectAClient.watchConfig("feature-flag");
const featureB = await projectBClient.watchConfig("feature-flag");
```

## Roadmap

- Config caching
- Config invalidation

## License

MIT
