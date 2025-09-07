# Replane JavaScript SDK

Small TypeScript client for fetching configuration values from a Replane API.

> Status: early. Minimal surface area on purpose. Expect small breaking tweaks until 0.1.x.

## Why it exists

You just need: given a token + config name -> get the value. This package does only that, well:

- Single focused call: `getConfig(name)`
- Works in ESM and CJS (dual build)
- Zero runtime deps (uses native `fetch` — bring a polyfill if your runtime lacks it)
- Tiny bundle footprint
- Strong TypeScript types + custom error with status/body

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

const featureFlag = await client.getConfig<boolean>("new-onboarding");

// or a more complex example

interface PasswordRequirements {
  minLength: number;
  requireSymbol: boolean;
}

const passwordRequirements = await client.getConfig<PasswordRequirements>(
  "password-requirements"
);
```

## API

### `createReplaneClient(token, options?)`

Returns an object: `{ getConfig }`.

#### Options

- `baseUrl` (string) – API origin.
- `apiKey` (string) - API key for authorization.
- `fetchFn` (function) – custom fetch (e.g. `undici.fetch` or mocked fetch in tests).
- `timeoutMs` (number) – abort the request after N ms.

### `client.getConfig(name, perCallOptions?)`

Per‑call options accept the same keys (`baseUrl`, `apiKey`, `fetchFn`, `timeoutMs`) and override client defaults.

Returns: the config value parsed as JSON.

### Errors: `ReplaneError`

Thrown when the HTTP status is not 2xx. Shape:

```ts
class ReplaneError extends Error {
  status: number;
  body: unknown; // parsed JSON or text when possible
}
```

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
const layout = await client.getConfig<LayoutConfig>("layout");
```

Timeout override:

```ts
await client.getConfig("slow-config", { timeoutMs: 1500 });
```

Custom fetch (tests):

```ts
const client = createReplaneClient("TKN", { fetchFn: mockFetch });
```

## Testing

```bash
pnpm test
```

## Building / Publishing

```bash
pnpm run build        # esm + cjs
pnpm run release      # bump version & publish (uses bumpp)
```

Artifacts:

```
dist/index.js   (ESM)
dist/index.cjs  (CJS)
dist/index.d.ts (types)
```

## Roadmap (short)

- Optional batch fetch
- ETag / conditional requests
- Minimal caching utilities (opt‑in)

## License

MIT
