// Re-export public API

export { Replane } from "./client";

// Error types
export { ReplaneError, ReplaneErrorCode } from "./error";

// Client types
export type {
  ReplaneContext,
  ReplaneLogger,
  GetConfigOptions,
  ReplaneSnapshot,
  ReplaneOptions,
  ConnectOptions,
} from "./client-types";

// Snapshot utilities
export { getReplaneSnapshot } from "./snapshot";
export type { GetReplaneSnapshotOptions } from "./snapshot";

// In-memory client for testing
export { InMemoryReplaneClient } from "./in-memory";
export type { InMemoryReplaneClientOptions, SetConfigOptions } from "./in-memory";

// Config types
export type { Override, Condition } from "./types";
