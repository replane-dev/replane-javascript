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

// Define your config types
interface Configs {
  "new-onboarding": boolean;
  "password-requirements": PasswordRequirements;
  "billing-enabled": boolean;
}

interface PasswordRequirements {
  minLength: number;
  requireSymbol: boolean;
}

const client = await createReplaneClient<Configs>({
  // Each API key belongs to one project only
  apiKey: process.env.REPLANE_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
});

// Get a config value (knows about latest updates via SSE)
const featureFlag = client.getConfig("new-onboarding"); // Typed as boolean

if (featureFlag) {
  console.log("New onboarding enabled!");
}

// Typed config - no need to specify type again
const passwordReqs = client.getConfig("password-requirements");

// Use the value directly
const { minLength } = passwordReqs; // TypeScript knows this is PasswordRequirements

// With context for override evaluation
const enabled = client.getConfig("billing-enabled", {
  context: {
    userId: "user-123",
    plan: "premium",
    region: "us-east",
  },
});

if (enabled) {
  console.log("Billing enabled for this user!");
}

// When done, clean up resources
client.close();
```

## API

### `createReplaneClient<T>(options)`

Returns a promise resolving to an object: `{ getConfig, close }`.

Type parameter `T` defines the shape of your configs (a mapping of config names to their value types).

`close()` stops the client and cleans up resources. After calling it, any subsequent call to `getConfig` will throw. It is safe to call multiple times (no‑op after the first call).

#### Options

- `baseUrl` (string) – API origin (no trailing slash needed).
- `apiKey` (string) – API key for authorization. Required. **Note:** Each API key is tied to a specific project and can only access configs from that project. To access configs from multiple projects, create multiple API keys and initialize separate client instances.
- `requiredConfigs` (object) – mark specific configs as required. If any required config is missing, the client will throw an error during initialization. Optional.
- `fallbackConfigs` (object) – fallback values to use if the initial request to fetch configs fails. Allows the client to start even when the API is unavailable. Use explicit `undefined` for configs without fallbacks. Optional.
- `context` (object) – default context for all config evaluations. Can be overridden per-request in `getConfig()`. Optional.
- `fetchFn` (function) – custom fetch (e.g. `undici.fetch` or mocked fetch in tests). Optional.
- `timeoutMs` (number) – abort the request after N ms. Default: 2000.
- `retries` (number) – number of retry attempts on failures (5xx or network errors). Default: 2.
- `retryDelayMs` (number) – base delay between retries in ms (a small jitter is applied). Default: 200.
- `logger` (object) – custom logger with `debug`, `info`, `warn`, `error` methods. Default: `console`.

### `client.getConfig<K>(name, options?)`

Gets the current config value. The client maintains an up-to-date cache that receives realtime updates via Server-Sent Events (SSE) in the background.

Parameters:

- `name` (K extends keyof T) – config name to fetch. TypeScript will enforce that this is a valid config name from your `Configs` interface.
- `options` (object) – optional configuration:
  - `context` (object) – context merged with client-level context for override evaluation.

Returns the config value of type `T[K]` (synchronous). The return type is automatically inferred from your `Configs` interface.

Notes:

- The client receives realtime updates via SSE in the background.
- Values are automatically refreshed every 60 seconds as a fallback.
- If the config is not found, throws a `ReplaneError` with code `not_found`.
- Context-based overrides are evaluated automatically based on context.

Example:

```ts
interface Configs {
  "billing-enabled": boolean;
  "max-connections": number;
}

const client = await createReplaneClient<Configs>({
  apiKey: "your-api-key",
  baseUrl: "https://api.my-replane-host.com",
});

// Get value without context - TypeScript knows this is boolean
const enabled = client.getConfig("billing-enabled");

// Get value with context for override evaluation
const userEnabled = client.getConfig("billing-enabled", {
  context: { userId: "user-123", plan: "premium" },
});

// Clean up when done
client.close();
```

### `createInMemoryReplaneClient(initialData)`

Creates a client backed by an in-memory store instead of making HTTP requests. Handy for unit tests or local development where you want deterministic config values without a server.

Parameters:

- `initialData` (object) – map of config name to value.

Returns a promise resolving to the same client shape as `createReplaneClient` (`{ getConfig, close }`).

Notes:

- `getConfig(name)` resolves to the value from `initialData`.
- If a name is missing, it throws a `ReplaneError` (`Config not found: <name>`).
- The client works as usual but doesn't receive SSE updates (values remain whatever is in-memory).

Example:

```ts
import { createInMemoryReplaneClient } from "replane-sdk";

interface Configs {
  "feature-a": boolean;
  "max-items": { value: number; ttl: number };
}

const client = await createInMemoryReplaneClient<Configs>({
  "feature-a": true,
  "max-items": { value: 10, ttl: 3600 },
});

const featureA = client.getConfig("feature-a"); // TypeScript knows this is boolean
console.log(featureA); // true

const maxItems = client.getConfig("max-items"); // TypeScript knows the type
console.log(maxItems); // { value: 10, ttl: 3600 }

client.close();
```

### `client.close()`

Gracefully shuts down the client and cleans up resources. Subsequent method calls will throw. Use this in environments where you manage resource lifecycles explicitly (e.g. shutting down a server or worker).

```ts
// During shutdown
client.close();
```

### Errors

`createReplaneClient` throws if the initial request to fetch configs fails with non‑2xx HTTP responses and network errors. A `ReplaneError` is thrown for HTTP failures; other errors may be thrown for network/parse issues.

The client receives realtime updates via SSE in the background. SSE connection errors are logged and automatically retried, but don't affect `getConfig` calls (which return the last known value).

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

interface Configs {
  layout: LayoutConfig;
}

const client = await createReplaneClient<Configs>({
  apiKey: process.env.REPLANE_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
});

const layout = client.getConfig("layout"); // TypeScript knows this is LayoutConfig
console.log(layout); // { variant: "a", ttl: 3600 }
```

### Context-based overrides

```ts
interface Configs {
  "advanced-features": boolean;
}

const client = await createReplaneClient<Configs>({
  apiKey: process.env.REPLANE_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
});

// Config has base value `false` but override: if `plan === "premium"` then `true`

// Free user
const freeUserEnabled = client.getConfig("advanced-features", {
  context: { plan: "free" },
}); // false

// Premium user
const premiumUserEnabled = client.getConfig("advanced-features", {
  context: { plan: "premium" },
}); // true
```

### Client-level context

```ts
interface Configs {
  "feature-flag": boolean;
}

const client = await createReplaneClient<Configs>({
  apiKey: process.env.REPLANE_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
  context: {
    userId: "user-123",
    region: "us-east",
  },
});

// This context is used for all configs unless overridden
const value1 = client.getConfig("feature-flag"); // Uses client-level context
const value2 = client.getConfig("feature-flag", {
  context: { userId: "user-321" },
}); // Merges with client context
```

### Custom fetch (tests)

```ts
const client = await createReplaneClient({
  apiKey: "TKN",
  baseUrl: "https://api",
  fetchFn: mockFetch,
});
```

### Required configs

```ts
interface Configs {
  "api-key": string;
  "database-url": string;
  "optional-feature": boolean;
}

const client = await createReplaneClient<Configs>({
  apiKey: process.env.REPLANE_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
  requiredConfigs: {
    "api-key": true,
    "database-url": true,
    "optional-feature": false, // Not required
  },
});

// If any required config is missing, initialization will throw
// Required configs that are deleted won't be removed (warning logged instead)
```

### Fallback configs

```ts
interface Configs {
  "feature-flag": boolean;
  "max-connections": number;
  "timeout-ms": number;
}

const client = await createReplaneClient<Configs>({
  apiKey: process.env.REPLANE_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
  fallbackConfigs: {
    "feature-flag": false, // Use false if fetch fails
    "max-connections": 10, // Use 10 if fetch fails
    "timeout-ms": undefined, // No fallback - client.getConfig('timeout-ms') will throw if the initial fetch failed
  },
});

// If the initial fetch fails, fallback values are used
// Once the client connects, it will receive realtime updates
const maxConnections = client.getConfig("max-connections"); // 10 (or real value)
```

### Multiple projects

```ts
interface ProjectAConfigs {
  "feature-flag": boolean;
  "max-users": number;
}

interface ProjectBConfigs {
  "feature-flag": boolean;
  "api-rate-limit": number;
}

// Each project needs its own API key and client instance
const projectAClient = await createReplaneClient<ProjectAConfigs>({
  apiKey: process.env.PROJECT_A_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
});

const projectBClient = await createReplaneClient<ProjectBConfigs>({
  apiKey: process.env.PROJECT_B_API_KEY!,
  baseUrl: "https://api.my-replane-host.com",
});

// Each client only accesses configs from its respective project
const featureA = projectAClient.getConfig("feature-flag"); // boolean
const featureB = projectBClient.getConfig("feature-flag"); // boolean
```

## Roadmap

- Config caching
- Config invalidation

## License

MIT
