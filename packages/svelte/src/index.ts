// Components
export { default as ReplaneContext } from "./ReplaneContext.svelte";

// Stores
export { getReplane, config, configFrom, createTypedReplane, createTypedConfig } from "./stores";

// Context utilities (for advanced use cases)
export { setReplaneContext, getReplaneContext, hasReplaneContext } from "./context";

// Re-export from SDK for convenience
export {
  createReplaneClient,
  createInMemoryReplaneClient,
  restoreReplaneClient,
  getReplaneSnapshot,
  clearSnapshotCache,
  ReplaneError,
  ReplaneErrorCode,
} from "@replanejs/sdk";

export type {
  ReplaneClient,
  ReplaneClientOptions,
  ReplaneSnapshot,
  ReplaneLogger,
  GetConfigOptions,
  RestoreReplaneClientOptions,
  GetReplaneSnapshotOptions,
} from "@replanejs/sdk";

// Types
export type {
  ReplaneContextValue,
  ReplaneContextProps,
  ReplaneContextWithClientProps,
  ReplaneContextWithOptionsProps,
  ConfigOptions,
} from "./types";

// Type guards
export { hasClient, hasOptions } from "./types";
