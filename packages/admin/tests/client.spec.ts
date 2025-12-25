import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReplaneAdmin, ReplaneAdminError } from "../src/client.js";
import { DEFAULT_AGENT } from "../src/version.js";

// ============================================================================
// Test Utilities
// ============================================================================

function createFetchMock() {
  const mockFetch = vi.fn<typeof fetch>();
  return mockFetch;
}

function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

// ============================================================================
// ReplaneAdmin - Initialization
// ============================================================================

describe("ReplaneAdmin - Initialization", () => {
  it("creates client with required options", () => {
    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev",
      apiKey: "rpa_test_key",
    });

    expect(admin).toBeInstanceOf(ReplaneAdmin);
    expect(admin.workspaces).toBeDefined();
    expect(admin.projects).toBeDefined();
    expect(admin.configs).toBeDefined();
    expect(admin.environments).toBeDefined();
    expect(admin.sdkKeys).toBeDefined();
    expect(admin.members).toBeDefined();
  });

  it("appends /api/admin/v1 to base URL", async () => {
    const mockFetch = createFetchMock();
    mockFetch.mockResolvedValueOnce(jsonResponse({ projects: [] }));

    vi.stubGlobal("fetch", mockFetch);

    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev",
      apiKey: "rpa_test_key",
    });

    await admin.projects.list();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.replane.dev/api/admin/v1/projects",
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });

  it("strips trailing slash from base URL", async () => {
    const mockFetch = createFetchMock();
    mockFetch.mockResolvedValueOnce(jsonResponse({ projects: [] }));

    vi.stubGlobal("fetch", mockFetch);

    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev/",
      apiKey: "rpa_test_key",
    });

    await admin.projects.list();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.replane.dev/api/admin/v1/projects",
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });

  it("uses default agent when not provided", async () => {
    const mockFetch = createFetchMock();
    mockFetch.mockResolvedValueOnce(jsonResponse({ projects: [] }));

    vi.stubGlobal("fetch", mockFetch);

    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev",
      apiKey: "rpa_test_key",
    });

    await admin.projects.list();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": DEFAULT_AGENT,
        }),
      })
    );

    vi.unstubAllGlobals();
  });

  it("uses custom agent when provided", async () => {
    const mockFetch = createFetchMock();
    mockFetch.mockResolvedValueOnce(jsonResponse({ projects: [] }));

    vi.stubGlobal("fetch", mockFetch);

    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev",
      apiKey: "rpa_test_key",
      agent: "my-custom-agent/1.0.0",
    });

    await admin.projects.list();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "my-custom-agent/1.0.0",
        }),
      })
    );

    vi.unstubAllGlobals();
  });
});

// ============================================================================
// ReplaneAdmin - Authentication
// ============================================================================

describe("ReplaneAdmin - Authentication", () => {
  let mockFetch: ReturnType<typeof createFetchMock>;

  beforeEach(() => {
    mockFetch = createFetchMock();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends Bearer token in Authorization header", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ projects: [] }));

    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev",
      apiKey: "rpa_my_secret_key",
    });

    await admin.projects.list();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer rpa_my_secret_key",
        }),
      })
    );
  });
});

// ============================================================================
// ReplaneAdmin - Error Handling
// ============================================================================

describe("ReplaneAdmin - Error Handling", () => {
  let mockFetch: ReturnType<typeof createFetchMock>;

  beforeEach(() => {
    mockFetch = createFetchMock();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws ReplaneAdminError on 401 response", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse("Invalid API key", 401));

    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev",
      apiKey: "rpa_invalid_key",
    });

    try {
      await admin.projects.list();
      expect.fail("Expected ReplaneAdminError to be thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ReplaneAdminError);
      expect(error).toMatchObject({
        status: 401,
        message: "Invalid API key",
      });
    }
  });

  it("throws ReplaneAdminError on 403 response", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse("Forbidden", 403));

    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev",
      apiKey: "rpa_test_key",
    });

    try {
      await admin.projects.list();
      expect.fail("Expected ReplaneAdminError to be thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ReplaneAdminError);
      expect(error).toMatchObject({
        status: 403,
        message: "Forbidden",
      });
    }
  });

  it("throws ReplaneAdminError on 404 response", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse("Project not found", 404));

    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev",
      apiKey: "rpa_test_key",
    });

    try {
      await admin.projects.get({ projectId: "non-existent-id" });
      expect.fail("Expected ReplaneAdminError to be thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ReplaneAdminError);
      expect(error).toMatchObject({
        status: 404,
        message: "Project not found",
      });
    }
  });

  it("throws ReplaneAdminError on 500 response", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse("Internal server error", 500));

    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev",
      apiKey: "rpa_test_key",
    });

    try {
      await admin.projects.list();
      expect.fail("Expected ReplaneAdminError to be thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ReplaneAdminError);
      expect(error).toMatchObject({
        status: 500,
        message: "Internal server error",
      });
    }
  });

  it("handles non-JSON error responses", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));

    const admin = new ReplaneAdmin({
      baseUrl: "https://app.replane.dev",
      apiKey: "rpa_test_key",
    });

    try {
      await admin.projects.list();
      expect.fail("Expected ReplaneAdminError to be thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ReplaneAdminError);
      expect(error).toMatchObject({
        status: 502,
        message: "Request failed with status 502",
      });
    }
  });
});

// ============================================================================
// Workspaces API
// ============================================================================

describe("Workspaces API", () => {
  let mockFetch: ReturnType<typeof createFetchMock>;
  let admin: ReplaneAdmin;

  beforeEach(() => {
    mockFetch = createFetchMock();
    vi.stubGlobal("fetch", mockFetch);
    admin = new ReplaneAdmin({ baseUrl: "https://test.replane.dev", apiKey: "rpa_test_key" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("list", () => {
    it("returns list of workspaces", async () => {
      const workspaces = [
        {
          id: "ws-1",
          name: "Workspace 1",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
        },
        {
          id: "ws-2",
          name: "Workspace 2",
          createdAt: "2024-02-01T00:00:00Z",
          updatedAt: "2024-02-02T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce(jsonResponse({ workspaces }));

      const result = await admin.workspaces.list();

      expect(result.workspaces).toHaveLength(2);
      expect(result.workspaces[0]).toMatchObject({ id: "ws-1", name: "Workspace 1" });
      expect(result.workspaces[1]).toMatchObject({ id: "ws-2", name: "Workspace 2" });
    });

    it("makes GET request to /workspaces", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ workspaces: [] }));

      await admin.workspaces.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/workspaces"),
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("get", () => {
    it("returns workspace by ID", async () => {
      const workspace = {
        id: "ws-1",
        name: "My Workspace",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(workspace));

      const result = await admin.workspaces.get({ workspaceId: "ws-1" });

      expect(result).toMatchObject({
        id: "ws-1",
        name: "My Workspace",
      });
    });

    it("makes GET request to /workspaces/{workspaceId}", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "ws-123",
          name: "Test",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        })
      );

      await admin.workspaces.get({ workspaceId: "ws-123" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/workspaces/ws-123"),
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("create", () => {
    it("creates a new workspace", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "new-ws-id" }, 201));

      const result = await admin.workspaces.create({
        name: "New Workspace",
      });

      expect(result).toMatchObject({ id: "new-ws-id" });
    });

    it("makes POST request with JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "new-ws-id" }, 201));

      await admin.workspaces.create({
        name: "New Workspace",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/workspaces"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            name: "New Workspace",
          }),
        })
      );
    });
  });

  describe("delete", () => {
    it("deletes a workspace", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());

      await admin.workspaces.delete({ workspaceId: "ws-1" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/workspaces/ws-1"),
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("handles 204 No Content response", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());

      const result = await admin.workspaces.delete({ workspaceId: "ws-1" });

      expect(result).toBeUndefined();
    });
  });
});

// ============================================================================
// Projects API
// ============================================================================

describe("Projects API", () => {
  let mockFetch: ReturnType<typeof createFetchMock>;
  let admin: ReplaneAdmin;

  beforeEach(() => {
    mockFetch = createFetchMock();
    vi.stubGlobal("fetch", mockFetch);
    admin = new ReplaneAdmin({ baseUrl: "https://test.replane.dev", apiKey: "rpa_test_key" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("list", () => {
    it("returns list of projects", async () => {
      const projects = [
        {
          id: "proj-1",
          name: "Project 1",
          description: "Description 1",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
        },
        {
          id: "proj-2",
          name: "Project 2",
          description: "Description 2",
          createdAt: "2024-02-01T00:00:00Z",
          updatedAt: "2024-02-02T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce(jsonResponse({ projects }));

      const result = await admin.projects.list();

      expect(result.projects).toHaveLength(2);
      expect(result.projects[0]).toMatchObject({ id: "proj-1", name: "Project 1" });
      expect(result.projects[1]).toMatchObject({ id: "proj-2", name: "Project 2" });
    });

    it("makes GET request to /projects", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ projects: [] }));

      await admin.projects.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects"),
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("get", () => {
    it("returns project by ID", async () => {
      const project = {
        id: "proj-1",
        name: "My Project",
        description: "A great project",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(project));

      const result = await admin.projects.get({ projectId: "proj-1" });

      expect(result).toMatchObject({
        id: "proj-1",
        name: "My Project",
        description: "A great project",
      });
    });

    it("makes GET request to /projects/{projectId}", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "proj-123",
          name: "Test",
          description: "",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        })
      );

      await admin.projects.get({ projectId: "proj-123" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-123"),
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("create", () => {
    it("creates a new project", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "new-proj-id" }, 201));

      const result = await admin.projects.create({
        workspaceId: "ws-123",
        name: "New Project",
        description: "New project description",
      });

      expect(result).toMatchObject({ id: "new-proj-id" });
    });

    it("makes POST request to /workspaces/{workspaceId}/projects with JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "new-proj-id" }, 201));

      await admin.projects.create({
        workspaceId: "ws-123",
        name: "New Project",
        description: "Description",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/workspaces/ws-123/projects"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            name: "New Project",
            description: "Description",
          }),
        })
      );
    });
  });

  describe("update", () => {
    it("updates an existing project", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "proj-1" }));

      const result = await admin.projects.update({
        projectId: "proj-1",
        name: "Updated Name",
      });

      expect(result).toMatchObject({ id: "proj-1" });
    });

    it("makes PATCH request with JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "proj-1" }));

      await admin.projects.update({
        projectId: "proj-1",
        name: "Updated Name",
        description: "Updated description",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "Updated Name",
            description: "Updated description",
          }),
        })
      );
    });
  });

  describe("delete", () => {
    it("deletes a project", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());

      await admin.projects.delete({ projectId: "proj-1" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-1"),
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("handles 204 No Content response", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());

      const result = await admin.projects.delete({ projectId: "proj-1" });

      expect(result).toBeUndefined();
    });
  });
});

// ============================================================================
// Configs API
// ============================================================================

describe("Configs API", () => {
  let mockFetch: ReturnType<typeof createFetchMock>;
  let admin: ReplaneAdmin;

  beforeEach(() => {
    mockFetch = createFetchMock();
    vi.stubGlobal("fetch", mockFetch);
    admin = new ReplaneAdmin({ baseUrl: "https://test.replane.dev", apiKey: "rpa_test_key" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("list", () => {
    it("returns list of configs for a project", async () => {
      const configs = [
        {
          id: "config-1",
          name: "feature-flags",
          description: "Feature flags",
          version: 1,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce(jsonResponse({ configs }));

      const result = await admin.configs.list({ projectId: "proj-1" });

      expect(result.configs).toHaveLength(1);
      expect(result.configs[0]).toMatchObject({
        id: "config-1",
        name: "feature-flags",
      });
    });

    it("makes GET request to /projects/{projectId}/configs", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ configs: [] }));

      await admin.configs.list({ projectId: "proj-123" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-123/configs"),
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("get", () => {
    it("returns config by name", async () => {
      const config = {
        id: "config-1",
        name: "my-config",
        description: "My config",
        version: 3,
        base: {
          value: { enabled: true },
          schema: null,
          overrides: [],
        },
        variants: [],
        editors: ["user@example.com"],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(config));

      const result = await admin.configs.get({ projectId: "proj-1", configName: "my-config" });

      expect(result).toMatchObject({
        id: "config-1",
        name: "my-config",
        version: 3,
      });
    });

    it("encodes config name in URL", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "config-1",
          name: "config with spaces",
          version: 1,
          base: { value: null, schema: null, overrides: [] },
          variants: [],
          editors: [],
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        })
      );

      await admin.configs.get({ projectId: "proj-1", configName: "config with spaces" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/configs/config%20with%20spaces"),
        expect.any(Object)
      );
    });
  });

  describe("create", () => {
    it("creates a new config", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "new-config-id" }, 201));

      const result = await admin.configs.create({
        projectId: "proj-1",
        name: "new-config",
        description: "New config",
        editors: ["user@example.com"],
        maintainers: [],
        base: {
          value: true,
          schema: null,
          overrides: [],
        },
        variants: [],
      });

      expect(result).toMatchObject({ id: "new-config-id" });
    });

    it("makes POST request with JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "new-config-id" }, 201));

      const createData = {
        projectId: "proj-1",
        name: "new-config",
        description: "New config",
        editors: ["user@example.com"],
        maintainers: ["maintainer@example.com"],
        base: {
          value: { enabled: true },
          schema: { type: "object" },
          overrides: [],
        },
        variants: [
          {
            environmentId: "env-1",
            value: { enabled: false },
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
        ],
      };

      await admin.configs.create(createData);

      // The body should not include projectId
      const { projectId, ...bodyWithoutProjectId } = createData;

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-1/configs"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(bodyWithoutProjectId),
        })
      );
    });
  });

  describe("update", () => {
    it("updates an existing config", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "config-1", version: 4 }));

      const result = await admin.configs.update({
        projectId: "proj-1",
        configName: "my-config",
        description: "Updated description",
        editors: [],
        base: { value: true, schema: null, overrides: [] },
        variants: [],
      });

      expect(result).toMatchObject({ id: "config-1", version: 4 });
    });

    it("makes PUT request to /projects/{projectId}/configs/{configName}", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "config-1", version: 2 }));

      await admin.configs.update({
        projectId: "proj-1",
        configName: "my-config",
        description: "Updated",
        editors: [],
        base: { value: false, schema: null, overrides: [] },
        variants: [],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-1/configs/my-config"),
        expect.objectContaining({ method: "PUT" })
      );
    });
  });

  describe("delete", () => {
    it("deletes a config", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());

      await admin.configs.delete({ projectId: "proj-1", configName: "my-config" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-1/configs/my-config"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });
});

// ============================================================================
// Environments API
// ============================================================================

describe("Environments API", () => {
  let mockFetch: ReturnType<typeof createFetchMock>;
  let admin: ReplaneAdmin;

  beforeEach(() => {
    mockFetch = createFetchMock();
    vi.stubGlobal("fetch", mockFetch);
    admin = new ReplaneAdmin({ baseUrl: "https://test.replane.dev", apiKey: "rpa_test_key" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("list", () => {
    it("returns list of environments", async () => {
      const environments = [
        { id: "env-1", name: "production", order: 0 },
        { id: "env-2", name: "staging", order: 1 },
        { id: "env-3", name: "development", order: 2 },
      ];

      mockFetch.mockResolvedValueOnce(jsonResponse({ environments }));

      const result = await admin.environments.list({ projectId: "proj-1" });

      expect(result.environments).toHaveLength(3);
      expect(result.environments[0]).toMatchObject({
        id: "env-1",
        name: "production",
      });
    });

    it("makes GET request to /projects/{projectId}/environments", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ environments: [] }));

      await admin.environments.list({ projectId: "proj-123" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-123/environments"),
        expect.objectContaining({ method: "GET" })
      );
    });
  });
});

// ============================================================================
// SDK Keys API
// ============================================================================

describe("SDK Keys API", () => {
  let mockFetch: ReturnType<typeof createFetchMock>;
  let admin: ReplaneAdmin;

  beforeEach(() => {
    mockFetch = createFetchMock();
    vi.stubGlobal("fetch", mockFetch);
    admin = new ReplaneAdmin({ baseUrl: "https://test.replane.dev", apiKey: "rpa_test_key" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("list", () => {
    it("returns list of SDK keys", async () => {
      const sdkKeys = [
        {
          id: "key-1",
          name: "Production Key",
          description: "Main production key",
          environmentId: "env-prod",
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "key-2",
          name: "Staging Key",
          description: "Staging environment key",
          environmentId: "env-staging",
          createdAt: "2024-01-02T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce(jsonResponse({ sdkKeys }));

      const result = await admin.sdkKeys.list({ projectId: "proj-1" });

      expect(result.sdkKeys).toHaveLength(2);
      expect(result.sdkKeys[0]).toMatchObject({
        id: "key-1",
        name: "Production Key",
      });
    });

    it("makes GET request to /projects/{projectId}/sdk-keys", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ sdkKeys: [] }));

      await admin.sdkKeys.list({ projectId: "proj-123" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-123/sdk-keys"),
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("create", () => {
    it("creates a new SDK key and returns token", async () => {
      const newKey = {
        id: "new-key-id",
        name: "New SDK Key",
        description: "A new key",
        environmentId: "env-1",
        createdAt: "2024-01-01T00:00:00Z",
        key: "rp_new_secret_key_12345",
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(newKey, 201));

      const result = await admin.sdkKeys.create({
        projectId: "proj-1",
        name: "New SDK Key",
        description: "A new key",
        environmentId: "env-1",
      });

      expect(result).toMatchObject({
        id: "new-key-id",
        name: "New SDK Key",
        key: "rp_new_secret_key_12345",
      });
    });

    it("makes POST request with JSON body", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          {
            id: "key-id",
            name: "Test Key",
            description: "Test",
            environmentId: "env-1",
            createdAt: "2024-01-01T00:00:00Z",
            key: "rp_test_key",
          },
          201
        )
      );

      await admin.sdkKeys.create({
        projectId: "proj-1",
        name: "Test Key",
        description: "Test description",
        environmentId: "env-1",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-1/sdk-keys"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Test Key",
            description: "Test description",
            environmentId: "env-1",
          }),
        })
      );
    });
  });

  describe("delete", () => {
    it("deletes an SDK key", async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());

      await admin.sdkKeys.delete({ projectId: "proj-1", sdkKeyId: "key-1" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-1/sdk-keys/key-1"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });
});

// ============================================================================
// Members API
// ============================================================================

describe("Members API", () => {
  let mockFetch: ReturnType<typeof createFetchMock>;
  let admin: ReplaneAdmin;

  beforeEach(() => {
    mockFetch = createFetchMock();
    vi.stubGlobal("fetch", mockFetch);
    admin = new ReplaneAdmin({ baseUrl: "https://test.replane.dev", apiKey: "rpa_test_key" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("list", () => {
    it("returns list of project members", async () => {
      const members = [
        { email: "admin@example.com", role: "admin" },
        { email: "editor@example.com", role: "editor" },
        { email: "viewer@example.com", role: "viewer" },
      ];

      mockFetch.mockResolvedValueOnce(jsonResponse({ members }));

      const result = await admin.members.list({ projectId: "proj-1" });

      expect(result.members).toHaveLength(3);
      expect(result.members[0]).toMatchObject({
        email: "admin@example.com",
        role: "admin",
      });
    });

    it("makes GET request to /projects/{projectId}/members", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ members: [] }));

      await admin.members.list({ projectId: "proj-123" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/projects/proj-123/members"),
        expect.objectContaining({ method: "GET" })
      );
    });
  });
});
