import type { ConfigValue, Override, ReplaneAdmin } from "@replanejs/admin";
import type { ReplaneClient } from "@replanejs/sdk";

/**
 * Options for the test suite
 */
export interface TestSuiteOptions {
  /** Superadmin API key for creating workspaces */
  superadminKey: string;
  /** Base URL for the admin API (e.g., "http://localhost:8080") */
  adminApiBaseUrl: string;
  /** Base URL for the edge API (e.g., "http://localhost:8080") */
  edgeApiBaseUrl: string;
  /** Default timeout for waiting operations in ms (default: 5000) */
  defaultTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Test context available in each test
 */
export interface TestContext {
  /** Admin client for managing resources */
  admin: ReplaneAdmin;
  /** Workspace ID created for this test run */
  workspaceId: string;
  /** Project ID created for this test run */
  projectId: string;
  /** Environment ID (production) for this project */
  environmentId: string;
  /** SDK key for connecting to edge API */
  sdkKey: string;
  /** Edge API base URL */
  edgeApiBaseUrl: string;
  /** Admin API base URL */
  adminApiBaseUrl: string;
  /** Default timeout for waiting operations */
  defaultTimeout: number;

  /**
   * Sync the edge replica with the database
   */
  sync(): Promise<void>;

  /**
   * Create a new SDK client connected to the edge API
   */
  createClient<T extends object = Record<string, unknown>>(options?: {
    context?: Record<string, string | number | boolean | null | undefined>;
    defaults?: Partial<T>;
    required?: (keyof T)[] | Partial<T>;
  }): Promise<ReplaneClient<T>>;

  /**
   * Create a config in the test project
   */
  createConfig(
    name: string,
    value: ConfigValue,
    options?: {
      description?: string;
      overrides?: Override[];
    }
  ): Promise<void>;

  /**
   * Update a config in the test project
   */
  updateConfig(
    name: string,
    value: ConfigValue,
    options?: {
      description?: string;
      overrides?: Override[];
    }
  ): Promise<void>;

  /**
   * Delete a config in the test project
   */
  deleteConfig(name: string): Promise<void>;
}
