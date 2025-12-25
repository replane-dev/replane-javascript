export { ReplaneAdmin, ReplaneAdminError } from "./client.js";
export { VERSION, DEFAULT_AGENT } from "./version.js";
export type {
  // Client options
  ReplaneAdminOptions,

  // Common types
  ConfigValue,
  ConfigSchema,

  // Value types
  LiteralValue,
  ReferenceValue,
  ConditionValue,

  // Condition types
  EqualsCondition,
  InCondition,
  NotInCondition,
  LessThanCondition,
  LessThanOrEqualCondition,
  GreaterThanCondition,
  GreaterThanOrEqualCondition,
  SegmentationCondition,
  AndCondition,
  OrCondition,
  NotCondition,
  OverrideCondition,

  // Override type
  Override,

  // Workspace types
  Workspace,
  ListWorkspacesRequest,
  ListWorkspacesResponse,
  GetWorkspaceRequest,
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  DeleteWorkspaceRequest,

  // Project types
  Project,
  ListProjectsRequest,
  ListProjectsResponse,
  GetProjectRequest,
  CreateProjectRequest,
  CreateProjectResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
  DeleteProjectRequest,

  // Config types
  Config,
  ConfigBase,
  ConfigVariant,
  ConfigListItem,
  ListConfigsRequest,
  ListConfigsResponse,
  GetConfigRequest,
  CreateConfigRequest,
  CreateConfigResponse,
  UpdateConfigRequest,
  UpdateConfigResponse,
  DeleteConfigRequest,

  // Environment types
  Environment,
  ListEnvironmentsRequest,
  ListEnvironmentsResponse,

  // SDK Key types
  SdkKey,
  SdkKeyWithToken,
  ListSdkKeysRequest,
  ListSdkKeysResponse,
  CreateSdkKeyRequest,
  DeleteSdkKeyRequest,

  // Member types
  Member,
  ListMembersRequest,
  ListMembersResponse,

  // Error types
  ApiError,

  // Legacy type aliases (deprecated)
  WorkspaceListResponse,
  ProjectListResponse,
  ConfigListResponse,
  EnvironmentListResponse,
  SdkKeyListResponse,
  MemberListResponse,
} from "./types.js";
