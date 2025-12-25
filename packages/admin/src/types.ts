/**
 * Admin API Types for Replane
 */

// ===== Common Types =====

export type ConfigValue = unknown;
export type ConfigSchema = unknown;

// ===== Value Types (for condition values) =====

export interface LiteralValue {
  type: "literal";
  value: ConfigValue;
}

export interface ReferenceValue {
  type: "reference";
  projectId: string;
  configName: string;
  path: string;
}

export type ConditionValue = LiteralValue | ReferenceValue;

// ===== Condition Types =====

export interface EqualsCondition {
  operator: "equals";
  property: string;
  value: ConditionValue;
}

export interface InCondition {
  operator: "in";
  property: string;
  value: ConditionValue;
}

export interface NotInCondition {
  operator: "not_in";
  property: string;
  value: ConditionValue;
}

export interface LessThanCondition {
  operator: "less_than";
  property: string;
  value: ConditionValue;
}

export interface LessThanOrEqualCondition {
  operator: "less_than_or_equal";
  property: string;
  value: ConditionValue;
}

export interface GreaterThanCondition {
  operator: "greater_than";
  property: string;
  value: ConditionValue;
}

export interface GreaterThanOrEqualCondition {
  operator: "greater_than_or_equal";
  property: string;
  value: ConditionValue;
}

export interface SegmentationCondition {
  operator: "segmentation";
  property: string;
  fromPercentage: number;
  toPercentage: number;
  seed: string;
}

export interface AndCondition {
  operator: "and";
  conditions: OverrideCondition[];
}

export interface OrCondition {
  operator: "or";
  conditions: OverrideCondition[];
}

export interface NotCondition {
  operator: "not";
  condition: OverrideCondition;
}

export type OverrideCondition =
  | EqualsCondition
  | InCondition
  | NotInCondition
  | LessThanCondition
  | LessThanOrEqualCondition
  | GreaterThanCondition
  | GreaterThanOrEqualCondition
  | SegmentationCondition
  | AndCondition
  | OrCondition
  | NotCondition;

// ===== Override Type =====

export interface Override {
  name: string;
  conditions: OverrideCondition[];
  value: ConfigValue;
}

// ===== Workspace Types =====

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListWorkspacesRequest {
  // No parameters currently, but included for consistency
}

export interface ListWorkspacesResponse {
  workspaces: Workspace[];
}

export interface GetWorkspaceRequest {
  workspaceId: string;
}

export interface CreateWorkspaceRequest {
  name: string;
}

export interface CreateWorkspaceResponse {
  id: string;
}

export interface DeleteWorkspaceRequest {
  workspaceId: string;
}

// ===== Project Types =====

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListProjectsRequest {
  // No parameters currently, but included for consistency
}

export interface ListProjectsResponse {
  projects: Project[];
}

export interface GetProjectRequest {
  projectId: string;
}

export interface CreateProjectRequest {
  workspaceId: string;
  name: string;
  description: string;
}

export interface CreateProjectResponse {
  id: string;
}

export interface UpdateProjectRequest {
  projectId: string;
  name?: string;
  description?: string;
}

export interface UpdateProjectResponse {
  id: string;
}

export interface DeleteProjectRequest {
  projectId: string;
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

export interface ListConfigsRequest {
  projectId: string;
}

export interface ListConfigsResponse {
  configs: ConfigListItem[];
}

export interface GetConfigRequest {
  projectId: string;
  configName: string;
}

export interface CreateConfigRequest {
  projectId: string;
  name: string;
  description: string;
  editors: string[];
  maintainers: string[];
  base: ConfigBase;
  variants: ConfigVariant[];
}

export interface CreateConfigResponse {
  id: string;
}

export interface UpdateConfigRequest {
  projectId: string;
  configName: string;
  description: string;
  editors: string[];
  base: ConfigBase;
  variants: ConfigVariant[];
}

export interface UpdateConfigResponse {
  id: string;
  version: number;
}

export interface DeleteConfigRequest {
  projectId: string;
  configName: string;
}

// ===== Environment Types =====

export interface Environment {
  id: string;
  name: string;
  order: number;
}

export interface ListEnvironmentsRequest {
  projectId: string;
}

export interface ListEnvironmentsResponse {
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

export interface ListSdkKeysRequest {
  projectId: string;
}

export interface ListSdkKeysResponse {
  sdkKeys: SdkKey[];
}

export interface CreateSdkKeyRequest {
  projectId: string;
  name: string;
  description?: string;
  environmentId: string;
}

export interface DeleteSdkKeyRequest {
  projectId: string;
  sdkKeyId: string;
}

// ===== Member Types =====

export interface Member {
  email: string;
  role: string;
}

export interface ListMembersRequest {
  projectId: string;
}

export interface ListMembersResponse {
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

// ===== Legacy type aliases for backwards compatibility =====
/** @deprecated Use ListWorkspacesResponse */
export type WorkspaceListResponse = ListWorkspacesResponse;
/** @deprecated Use ListProjectsResponse */
export type ProjectListResponse = ListProjectsResponse;
/** @deprecated Use ListConfigsResponse */
export type ConfigListResponse = ListConfigsResponse;
/** @deprecated Use ListEnvironmentsResponse */
export type EnvironmentListResponse = ListEnvironmentsResponse;
/** @deprecated Use ListSdkKeysResponse */
export type SdkKeyListResponse = ListSdkKeysResponse;
/** @deprecated Use ListMembersResponse */
export type MemberListResponse = ListMembersResponse;
