import type {
  ReplaneAdminOptions,
  Project,
  ProjectListResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
  Config,
  ConfigListResponse,
  CreateConfigRequest,
  CreateConfigResponse,
  UpdateConfigRequest,
  UpdateConfigResponse,
  EnvironmentListResponse,
  SdkKeyListResponse,
  SdkKeyWithToken,
  CreateSdkKeyRequest,
  MemberListResponse,
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
 * const { id } = await admin.configs.create("project-id", {
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
      throw new ReplaneAdminError(
        errorResponse?.error ?? `Request failed with status ${response.status}`,
        response.status,
        errorResponse
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
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
  async list(): Promise<ProjectListResponse> {
    return this.client.request<ProjectListResponse>("GET", "/projects");
  }

  /**
   * Get a project by ID
   */
  async get(projectId: string): Promise<Project> {
    return this.client.request<Project>("GET", `/projects/${projectId}`);
  }

  /**
   * Create a new project
   */
  async create(data: CreateProjectRequest): Promise<CreateProjectResponse> {
    return this.client.request<CreateProjectResponse>("POST", "/projects", data);
  }

  /**
   * Update a project
   */
  async update(projectId: string, data: UpdateProjectRequest): Promise<UpdateProjectResponse> {
    return this.client.request<UpdateProjectResponse>("PATCH", `/projects/${projectId}`, data);
  }

  /**
   * Delete a project
   */
  async delete(projectId: string): Promise<void> {
    return this.client.request<void>("DELETE", `/projects/${projectId}`);
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
  async list(projectId: string): Promise<ConfigListResponse> {
    return this.client.request<ConfigListResponse>("GET", `/projects/${projectId}/configs`);
  }

  /**
   * Get a config by name
   */
  async get(projectId: string, configName: string): Promise<Config> {
    return this.client.request<Config>(
      "GET",
      `/projects/${projectId}/configs/${encodeURIComponent(configName)}`
    );
  }

  /**
   * Create a new config
   */
  async create(projectId: string, data: CreateConfigRequest): Promise<CreateConfigResponse> {
    return this.client.request<CreateConfigResponse>(
      "POST",
      `/projects/${projectId}/configs`,
      data
    );
  }

  /**
   * Update a config
   */
  async update(
    projectId: string,
    configName: string,
    data: UpdateConfigRequest
  ): Promise<UpdateConfigResponse> {
    return this.client.request<UpdateConfigResponse>(
      "PUT",
      `/projects/${projectId}/configs/${encodeURIComponent(configName)}`,
      data
    );
  }

  /**
   * Delete a config
   */
  async delete(projectId: string, configName: string): Promise<void> {
    return this.client.request<void>(
      "DELETE",
      `/projects/${projectId}/configs/${encodeURIComponent(configName)}`
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
  async list(projectId: string): Promise<EnvironmentListResponse> {
    return this.client.request<EnvironmentListResponse>(
      "GET",
      `/projects/${projectId}/environments`
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
  async list(projectId: string): Promise<SdkKeyListResponse> {
    return this.client.request<SdkKeyListResponse>("GET", `/projects/${projectId}/sdk-keys`);
  }

  /**
   * Create a new SDK key
   * Note: The returned key is only shown once and cannot be retrieved again
   */
  async create(projectId: string, data: CreateSdkKeyRequest): Promise<SdkKeyWithToken> {
    return this.client.request<SdkKeyWithToken>("POST", `/projects/${projectId}/sdk-keys`, data);
  }

  /**
   * Delete an SDK key
   */
  async delete(projectId: string, sdkKeyId: string): Promise<void> {
    return this.client.request<void>("DELETE", `/projects/${projectId}/sdk-keys/${sdkKeyId}`);
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
  async list(projectId: string): Promise<MemberListResponse> {
    return this.client.request<MemberListResponse>("GET", `/projects/${projectId}/members`);
  }
}
