import type {
  ReplaneAdminOptions,
  Workspace,
  ListWorkspacesResponse,
  GetWorkspaceRequest,
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  DeleteWorkspaceRequest,
  Project,
  ListProjectsResponse,
  GetProjectRequest,
  CreateProjectRequest,
  CreateProjectResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
  DeleteProjectRequest,
  Config,
  ListConfigsRequest,
  ListConfigsResponse,
  GetConfigRequest,
  CreateConfigRequest,
  CreateConfigResponse,
  UpdateConfigRequest,
  UpdateConfigResponse,
  DeleteConfigRequest,
  ListEnvironmentsRequest,
  ListEnvironmentsResponse,
  ListSdkKeysRequest,
  ListSdkKeysResponse,
  SdkKeyWithToken,
  CreateSdkKeyRequest,
  DeleteSdkKeyRequest,
  ListMembersRequest,
  ListMembersResponse,
  ApiError,
} from "./types.js";
import { DEFAULT_AGENT } from "./version.js";

/**
 * Error thrown by the Admin API client
 */
export class ReplaneAdminError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response?: ApiError
  ) {
    super(message);
    this.name = "ReplaneAdminError";
  }
}

/**
 * Admin API client for Replane
 *
 * Provides programmatic access to manage projects, configs, environments,
 * SDK keys, and members.
 *
 * @example
 * ```typescript
 * import { ReplaneAdmin } from "@replanejs/admin";
 *
 * const admin = new ReplaneAdmin({
 *   baseUrl: "https://app.replane.dev",
 *   apiKey: "rpa_...",
 * });
 *
 * // List all projects
 * const { projects } = await admin.projects.list();
 *
 * // Create a new config
 * const { id } = await admin.configs.create({
 *   projectId: "project-id",
 *   name: "my-config",
 *   description: "My config",
 *   editors: [],
 *   maintainers: [],
 *   base: { value: true, schema: null, overrides: [] },
 *   variants: [],
 * });
 * ```
 */
export class ReplaneAdmin {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly agent: string;
  private readonly fetchFn: typeof fetch;

  public readonly workspaces: WorkspacesApi;
  public readonly projects: ProjectsApi;
  public readonly configs: ConfigsApi;
  public readonly environments: EnvironmentsApi;
  public readonly sdkKeys: SdkKeysApi;
  public readonly members: MembersApi;

  constructor(options: ReplaneAdminOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = `${options.baseUrl.replace(/\/$/, "")}/api/admin/v1`;
    this.agent = options.agent ?? DEFAULT_AGENT;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;

    this.workspaces = new WorkspacesApi(this);
    this.projects = new ProjectsApi(this);
    this.configs = new ConfigsApi(this);
    this.environments = new EnvironmentsApi(this);
    this.sdkKeys = new SdkKeysApi(this);
    this.members = new MembersApi(this);
  }

  /**
   * Make an authenticated request to the Admin API
   * @internal
   */
  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "User-Agent": this.agent,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await this.fetchFn(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorResponse: ApiError | undefined;
      try {
        errorResponse = await response.json();
      } catch {
        // Ignore JSON parse errors
      }
      // Handle both string and object error messages
      let errorMessage = `Request failed with status ${response.status}`;
      if (errorResponse?.error) {
        errorMessage =
          typeof errorResponse.error === "string"
            ? errorResponse.error
            : JSON.stringify(errorResponse.error);
      }
      throw new ReplaneAdminError(errorMessage, response.status, errorResponse);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }
}

/**
 * Workspaces API
 * Note: Most workspace operations require superuser access
 */
class WorkspacesApi {
  constructor(private readonly client: ReplaneAdmin) {}

  /**
   * List all workspaces (requires superuser access)
   */
  async list(): Promise<ListWorkspacesResponse> {
    return this.client.request<ListWorkspacesResponse>("GET", "/workspaces");
  }

  /**
   * Get a workspace by ID (requires superuser access)
   */
  async get(request: GetWorkspaceRequest): Promise<Workspace> {
    return this.client.request<Workspace>("GET", `/workspaces/${request.workspaceId}`);
  }

  /**
   * Create a new workspace (requires superuser access)
   */
  async create(request: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> {
    return this.client.request<CreateWorkspaceResponse>("POST", "/workspaces", request);
  }

  /**
   * Delete a workspace (requires superuser access)
   */
  async delete(request: DeleteWorkspaceRequest): Promise<void> {
    return this.client.request<void>("DELETE", `/workspaces/${request.workspaceId}`);
  }
}

/**
 * Projects API
 */
class ProjectsApi {
  constructor(private readonly client: ReplaneAdmin) {}

  /**
   * List all projects
   */
  async list(): Promise<ListProjectsResponse> {
    return this.client.request<ListProjectsResponse>("GET", "/projects");
  }

  /**
   * Get a project by ID
   */
  async get(request: GetProjectRequest): Promise<Project> {
    return this.client.request<Project>("GET", `/projects/${request.projectId}`);
  }

  /**
   * Create a new project in a workspace
   */
  async create(request: CreateProjectRequest): Promise<CreateProjectResponse> {
    const { workspaceId, ...body } = request;
    return this.client.request<CreateProjectResponse>(
      "POST",
      `/workspaces/${workspaceId}/projects`,
      body
    );
  }

  /**
   * Update a project
   */
  async update(request: UpdateProjectRequest): Promise<UpdateProjectResponse> {
    const { projectId, ...body } = request;
    return this.client.request<UpdateProjectResponse>("PATCH", `/projects/${projectId}`, body);
  }

  /**
   * Delete a project
   */
  async delete(request: DeleteProjectRequest): Promise<void> {
    return this.client.request<void>("DELETE", `/projects/${request.projectId}`);
  }
}

/**
 * Configs API
 */
class ConfigsApi {
  constructor(private readonly client: ReplaneAdmin) {}

  /**
   * List all configs in a project
   */
  async list(request: ListConfigsRequest): Promise<ListConfigsResponse> {
    return this.client.request<ListConfigsResponse>(
      "GET",
      `/projects/${request.projectId}/configs`
    );
  }

  /**
   * Get a config by name
   */
  async get(request: GetConfigRequest): Promise<Config> {
    return this.client.request<Config>(
      "GET",
      `/projects/${request.projectId}/configs/${encodeURIComponent(request.configName)}`
    );
  }

  /**
   * Create a new config
   */
  async create(request: CreateConfigRequest): Promise<CreateConfigResponse> {
    const { projectId, ...body } = request;
    return this.client.request<CreateConfigResponse>(
      "POST",
      `/projects/${projectId}/configs`,
      body
    );
  }

  /**
   * Update a config
   */
  async update(request: UpdateConfigRequest): Promise<UpdateConfigResponse> {
    const { projectId, configName, ...body } = request;
    return this.client.request<UpdateConfigResponse>(
      "PUT",
      `/projects/${projectId}/configs/${encodeURIComponent(configName)}`,
      body
    );
  }

  /**
   * Delete a config
   */
  async delete(request: DeleteConfigRequest): Promise<void> {
    return this.client.request<void>(
      "DELETE",
      `/projects/${request.projectId}/configs/${encodeURIComponent(request.configName)}`
    );
  }
}

/**
 * Environments API
 */
class EnvironmentsApi {
  constructor(private readonly client: ReplaneAdmin) {}

  /**
   * List all environments in a project
   */
  async list(request: ListEnvironmentsRequest): Promise<ListEnvironmentsResponse> {
    return this.client.request<ListEnvironmentsResponse>(
      "GET",
      `/projects/${request.projectId}/environments`
    );
  }
}

/**
 * SDK Keys API
 */
class SdkKeysApi {
  constructor(private readonly client: ReplaneAdmin) {}

  /**
   * List all SDK keys in a project
   */
  async list(request: ListSdkKeysRequest): Promise<ListSdkKeysResponse> {
    return this.client.request<ListSdkKeysResponse>(
      "GET",
      `/projects/${request.projectId}/sdk-keys`
    );
  }

  /**
   * Create a new SDK key
   * Note: The returned key is only shown once and cannot be retrieved again
   */
  async create(request: CreateSdkKeyRequest): Promise<SdkKeyWithToken> {
    const { projectId, ...body } = request;
    return this.client.request<SdkKeyWithToken>("POST", `/projects/${projectId}/sdk-keys`, body);
  }

  /**
   * Delete an SDK key
   */
  async delete(request: DeleteSdkKeyRequest): Promise<void> {
    return this.client.request<void>(
      "DELETE",
      `/projects/${request.projectId}/sdk-keys/${request.sdkKeyId}`
    );
  }
}

/**
 * Members API
 */
class MembersApi {
  constructor(private readonly client: ReplaneAdmin) {}

  /**
   * List all members in a project
   */
  async list(request: ListMembersRequest): Promise<ListMembersResponse> {
    return this.client.request<ListMembersResponse>(
      "GET",
      `/projects/${request.projectId}/members`
    );
  }
}
