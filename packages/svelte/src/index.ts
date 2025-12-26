// Components
export { default as ReplaneContext } from "./ReplaneContext.svelte";

// Stores
export { getReplane, config, configFrom, createTypedReplane, createTypedConfig } from "./stores";

// Context utilities (for advanced use cases)
export { setReplaneContext, getReplaneContext, hasReplaneContext } from "./context";

// Re-export from SDK for convenience
export { Replane, getReplaneSnapshot, ReplaneError, ReplaneErrorCode } from "@replanejs/sdk";

export type {
  ReplaneSnapshot,
  ReplaneContext as ReplaneContextType,
  ReplaneLogger,
  ReplaneOptions,
  ConnectOptions,
  GetConfigOptions,
  GetReplaneSnapshotOptions,
} from "@replanejs/sdk";

// Types
export type {
  ReplaneContextValue,
  ReplaneContextProps,
  ReplaneContextWithClientProps,
  ReplaneContextWithOptionsProps,
  ReplaneContextOptions,
} from "./types";

// Type guards
export { hasClient, hasOptions } from "./types";
