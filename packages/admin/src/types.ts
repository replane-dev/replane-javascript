/**
 * Admin API Types for Replane
 */

// ===== Common Types =====

export type ConfigValue = unknown;
export type ConfigSchema = unknown;

export interface Override {
  condition: OverrideCondition;
  value: ConfigValue;
}

export interface OverrideCondition {
  type: string;
  [key: string]: unknown;
}

// ===== Project Types =====

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
}

export interface ProjectListResponse {
  projects: Project[];
}

export interface CreateProjectResponse {
  id: string;
}

export interface UpdateProjectResponse {
  id: string;
}

// ===== Config Types =====

export interface ConfigBase {
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
}

export interface ConfigVariant {
  environmentId: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  useBaseSchema: boolean;
}

export interface Config {
  id: string;
  name: string;
  description?: string;
  version: number;
  base: ConfigBase;
  variants: ConfigVariant[];
  editors: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ConfigListItem {
  id: string;
  name: string;
  description?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigListResponse {
  configs: ConfigListItem[];
}

export interface CreateConfigRequest {
  name: string;
  description: string;
  editors: string[];
  maintainers: string[];
  base: ConfigBase;
  variants: ConfigVariant[];
}

export interface UpdateConfigRequest {
  description: string;
  editors: string[];
  base: ConfigBase;
  variants: ConfigVariant[];
}

export interface CreateConfigResponse {
  id: string;
}

export interface UpdateConfigResponse {
  id: string;
  version: number;
}

// ===== Environment Types =====

export interface Environment {
  id: string;
  name: string;
  order: number;
}

export interface EnvironmentListResponse {
  environments: Environment[];
}

// ===== SDK Key Types =====

export interface SdkKey {
  id: string;
  name: string;
  description: string;
  environmentId: string;
  createdAt: string;
}

export interface SdkKeyWithToken extends SdkKey {
  key: string;
}

export interface SdkKeyListResponse {
  sdkKeys: SdkKey[];
}

export interface CreateSdkKeyRequest {
  name: string;
  description?: string;
  environmentId: string;
}

// ===== Member Types =====

export interface Member {
  email: string;
  role: string;
}

export interface MemberListResponse {
  members: Member[];
}

// ===== Error Types =====

export interface ApiError {
  error: string;
}

// ===== Client Options =====

export interface ReplaneAdminOptions {
  /**
   * Admin API key (starts with rpa_)
   */
  apiKey: string;

  /**
   * Base URL for Replane instance
   * @example "https://app.replane.dev"
   */
  baseUrl: string;

  /**
   * Custom agent identifier for tracking SDK usage
   * @default "replane-admin/{version}"
   */
  agent?: string;

  /**
   * Custom fetch function for making HTTP requests.
   * Useful for testing or environments without global fetch.
   * @default globalThis.fetch
   */
  fetchFn?: typeof fetch;
}
