# Replane JavaScript SDK

[![npm](https://img.shields.io/npm/v/@replanejs/sdk)](https://www.npmjs.com/package/@replanejs/sdk)
[![License](https://img.shields.io/github/license/replane-dev/replane-javascript)](https://github.com/replane-dev/replane-javascript/blob/main/LICENSE)
[![Community](https://img.shields.io/badge/discussions-join-blue?logo=github)](https://github.com/orgs/replane-dev/discussions)

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
npm install @replanejs/sdk
# or
pnpm add @replanejs/sdk
# or
yarn add @replanejs/sdk
```

## Quick start

> **Important:** Each SDK key is tied to a specific project. The client can only access configs from the project that the SDK key belongs to. If you need configs from multiple projects, create separate SDK keys and initialize separate clients—one per project.

```ts
import { createReplaneClient } from "@replanejs/sdk";

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

const replane = await createReplaneClient<Configs>({
  // Each SDK key belongs to one project only
  sdkKey: process.env.REPLANE_SDK_KEY!,
  baseUrl: "https://replane.my-hosting.com",
});

// Get a config value (knows about latest updates via SSE)
const featureFlag = replane.get("new-onboarding"); // Typed as boolean

if (featureFlag) {
  console.log("New onboarding enabled!");
}

// Typed config - no need to specify type again
const passwordReqs = replane.get("password-requirements");

// Use the value directly
const { minLength } = passwordReqs; // TypeScript knows this is PasswordRequirements

// With context for override evaluation
const enabled = replane.get("billing-enabled", {
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
replane.close();
```

## API

### `createReplaneClient<T>(options)`

Returns a promise resolving to an object: `{ get, subscribe, close }`.

Type parameter `T` defines the shape of your configs (a mapping of config names to their value types).

`close()` stops the configs client and cleans up resources. It is safe to call multiple times (no‑op after the first call).

#### Options

- `baseUrl` (string) – Replane origin (no trailing slash needed).
- `sdkKey` (string) – SDK key for authorization. Required. **Note:** Each SDK key is tied to a specific project and can only access configs from that project. To access configs from multiple projects, create multiple SDK keys and initialize separate client instances.
- `required` (object or array) – mark specific configs as required. If any required config is missing, the client will throw an error during initialization. Can be an object with boolean values or an array of config names. Optional.
- `fallbacks` (object) – fallback values to use if the initial request to fetch configs fails. Allows the client to start even when the API is unavailable. Optional.
- `context` (object) – default context for all config evaluations. Can be overridden per-request in `get()`. Optional.
- `fetchFn` (function) – custom fetch (e.g. `undici.fetch` or mocked fetch in tests). Optional.
- `timeoutMs` (number) – abort the request after N ms. Default: 2000.
- `retries` (number) – number of retry attempts on failures (5xx or network errors). Default: 2.
- `retryDelayMs` (number) – base delay between retries in ms (a small jitter is applied). Default: 200.
- `logger` (object) – custom logger with `debug`, `info`, `warn`, `error` methods. Default: `console`.

### `replane.get<K>(name, options?)`

Gets the current config value. The configs client maintains an up-to-date cache that receives realtime updates via Server-Sent Events (SSE) in the background.

Parameters:

- `name` (K extends keyof T) – config name to fetch. TypeScript will enforce that this is a valid config name from your `Configs` interface.
- `options` (object) – optional configuration:
  - `context` (object) – context merged with client-level context for override evaluation.

Returns the config value of type `T[K]` (synchronous). The return type is automatically inferred from your `Configs` interface.

Notes:

- The Replane client receives realtime updates via SSE in the background.
- If the config is not found, throws a `ReplaneError` with code `not_found`.
- Context-based overrides are evaluated automatically based on context.

Example:

```ts
interface Configs {
  "billing-enabled": boolean;
  "max-connections": number;
}

const replane = await createReplaneClient<Configs>({
  sdkKey: "your-sdk-key",
  baseUrl: "https://replane.my-host.com",
});

// Get value without context - TypeScript knows this is boolean
const enabled = replane.get("billing-enabled");

// Get value with context for override evaluation
const userEnabled = replane.get("billing-enabled", {
  context: { userId: "user-123", plan: "premium" },
});

// Clean up when done
replane.close();
```

### `replane.subscribe(callback)` or `replane.subscribe(configName, callback)`

Subscribe to config changes and receive real-time updates when configs are modified.

**Two overloads:**

1. **Subscribe to all config changes:**

   ```ts
   const unsubscribe = replane.subscribe((config) => {
     console.log(`Config ${config.name} changed to:`, config.value);
   });
   ```

2. **Subscribe to a specific config:**
   ```ts
   const unsubscribe = replane.subscribe("billing-enabled", (config) => {
     console.log(`billing-enabled changed to:`, config.value);
   });
   ```

Parameters:

- `callback` (function) – Function called when any config changes. Receives an object with `{ name, value }`.
- `configName` (K extends keyof T) – Optional. If provided, only changes to this specific config will trigger the callback.

Returns a function to unsubscribe from the config changes.

Example:

```ts
interface Configs {
  "feature-flag": boolean;
  "max-connections": number;
}

const replane = await createReplaneClient<Configs>({
  sdkKey: "your-sdk-key",
  baseUrl: "https://replane.my-host.com",
});

// Subscribe to all config changes
const unsubscribeAll = replane.subscribe((config) => {
  console.log(`Config ${config.name} updated:`, config.value);
});

// Subscribe to a specific config
const unsubscribeFeature = replane.subscribe("feature-flag", (config) => {
  console.log("Feature flag changed:", config.value);
  // config.value is typed as boolean
});

// Later: unsubscribe when done
unsubscribeAll();
unsubscribeFeature();

// Clean up when done
replane.close();
```

### `createInMemoryReplaneClient(initialData)`

Creates a client backed by an in-memory store instead of making HTTP requests. Handy for unit tests or local development where you want deterministic config values without a server.

Parameters:

- `initialData` (object) – map of config name to value.

Returns the same client shape as `createReplaneClient` (`{ get, subscribe, close }`).

Notes:

- `get(name)` resolves to the value from `initialData`.
- If a name is missing, it throws a `ReplaneError` (`Config not found: <name>`).
- The client works as usual but doesn't receive SSE updates (values remain whatever is in-memory).

Example:

```ts
import { createInMemoryReplaneClient } from "@replanejs/sdk";

interface Configs {
  "feature-a": boolean;
  "max-items": { value: number; ttl: number };
}

const replane = createInMemoryReplaneClient<Configs>({
  "feature-a": true,
  "max-items": { value: 10, ttl: 3600 },
});

const featureA = replane.get("feature-a"); // TypeScript knows this is boolean
console.log(featureA); // true

const maxItems = replane.get("max-items"); // TypeScript knows the type
console.log(maxItems); // { value: 10, ttl: 3600 }

replane.close();
```

### `replane.close()`

Gracefully shuts down the Replane client and cleans up resources. Subsequent method calls will throw. Use this in environments where you manage resource lifecycles explicitly (e.g. shutting down a server or worker).

```ts
// During shutdown
replane.close();
```

### Errors

`createReplaneClient` throws if the initial request to fetch configs fails with non‑2xx HTTP responses and network errors. A `ReplaneError` is thrown for HTTP failures; other errors may be thrown for network/parse issues.

The Replane client receives realtime updates via SSE in the background. SSE connection errors are logged and automatically retried, but don't affect `get` calls (which return the last known value).

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

const replane = await createReplaneClient<Configs>({
  sdkKey: process.env.REPLANE_SDK_KEY!,
  baseUrl: "https://replane.my-host.com",
});

const layout = replane.get("layout"); // TypeScript knows this is LayoutConfig
console.log(layout); // { variant: "a", ttl: 3600 }
```

### Context-based overrides

```ts
interface Configs {
  "advanced-features": boolean;
}

const replane = await createReplaneClient<Configs>({
  sdkKey: process.env.REPLANE_SDK_KEY!,
  baseUrl: "https://replane.my-host.com",
});

// Config has base value `false` but override: if `plan === "premium"` then `true`

// Free user
const freeUserEnabled = replane.get("advanced-features", {
  context: { plan: "free" },
}); // false

// Premium user
const premiumUserEnabled = replane.get("advanced-features", {
  context: { plan: "premium" },
}); // true
```

### Client-level context

```ts
interface Configs {
  "feature-flag": boolean;
}

const replane = await createReplaneClient<Configs>({
  sdkKey: process.env.REPLANE_SDK_KEY!,
  baseUrl: "https://replane.my-host.com",
  context: {
    userId: "user-123",
    region: "us-east",
  },
});

// This context is used for all configs unless overridden
const value1 = replane.get("feature-flag"); // Uses client-level context
const value2 = replane.get("feature-flag", {
  context: { userId: "user-321" },
}); // Merges with client context
```

### Custom fetch (tests)

```ts
const replane = await createReplaneClient({
  sdkKey: "TKN",
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

const replane = await createReplaneClient<Configs>({
  sdkKey: process.env.REPLANE_SDK_KEY!,
  baseUrl: "https://replane.my-host.com",
  required: {
    "api-key": true,
    "database-url": true,
    "optional-feature": false, // Not required
  },
});

// Alternative: use an array
// required: ["api-key", "database-url"]

// If any required config is missing, initialization will throw
```

### Fallback configs

```ts
interface Configs {
  "feature-flag": boolean;
  "max-connections": number;
  "timeout-ms": number;
}

const replane = await createReplaneClient<Configs>({
  sdkKey: process.env.REPLANE_SDK_KEY!,
  baseUrl: "https://replane.my-host.com",
  fallbacks: {
    "feature-flag": false, // Use false if fetch fails
    "max-connections": 10, // Use 10 if fetch fails
    "timeout-ms": 5000, // Use 5s if fetch fails
  },
});

// If the initial fetch fails, fallback values are used
// Once the configs client connects, it will receive realtime updates
const maxConnections = replane.get("max-connections"); // 10 (or real value)
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

// Each project needs its own SDK key and Replane client instance
const projectAConfigs = await createReplaneClient<ProjectAConfigs>({
  sdkKey: process.env.PROJECT_A_SDK_KEY!,
  baseUrl: "https://replane.my-host.com",
});

const projectBConfigs = await createReplaneClient<ProjectBConfigs>({
  sdkKey: process.env.PROJECT_B_SDK_KEY!,
  baseUrl: "https://replane.my-host.com",
});

// Each Replane client only accesses configs from its respective project
const featureA = projectAConfigs.get("feature-flag"); // boolean
const featureB = projectBConfigs.get("feature-flag"); // boolean
```

### Subscriptions

```ts
interface Configs {
  "feature-flag": boolean;
  "max-users": number;
}

const replane = await createReplaneClient<Configs>({
  sdkKey: process.env.REPLANE_SDK_KEY!,
  baseUrl: "https://replane.my-host.com",
});

// Subscribe to all config changes
const unsubscribeAll = replane.subscribe((config) => {
  console.log(`Config ${config.name} changed:`, config.value);

  // React to specific config changes
  if (config.name === "feature-flag") {
    console.log("Feature flag updated:", config.value);
  }
});

// Subscribe to a specific config only
const unsubscribeFeature = replane.subscribe("feature-flag", (config) => {
  console.log("Feature flag changed:", config.value);
  // config.value is automatically typed as boolean
});

// Subscribe to multiple specific configs
const unsubscribeMaxUsers = replane.subscribe("max-users", (config) => {
  console.log("Max users changed:", config.value);
  // config.value is automatically typed as number
});

// Cleanup
unsubscribeAll();
unsubscribeFeature();
unsubscribeMaxUsers();
replane.close();
```

## Roadmap

- Config caching
- Config invalidation

## Community

Have questions or want to discuss Replane? Join the conversation in [GitHub Discussions](https://github.com/orgs/replane-dev/discussions).

## License

MIT

