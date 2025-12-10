import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createReplaneClient,
  createInMemoryReplaneClient,
  ReplaneClient,
  ReplaneError,
} from "../src/index";
import { MockReplaneServerController } from "./utils";
import { RenderedOverride } from "../src/types";

function sync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createReplaneClient", () => {
  let mockServer: MockReplaneServerController;
  let clientPromise: Promise<ReplaneClient<Record<string, unknown>>>;
  let silentLogger: ReturnType<typeof createSilentLogger>;

  function createSilentLogger() {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  beforeEach(() => {
    mockServer = new MockReplaneServerController();
    silentLogger = createSilentLogger();
  });

  afterEach(async () => {
    try {
      const client = await clientPromise;
      client.close();
    } catch {
      // Client may have failed to initialize
    }
    mockServer.close();
  });

  function createClient<T extends Record<string, unknown>>(
    options: Partial<Parameters<typeof createReplaneClient<T>>[0]> = {}
  ) {
    return createReplaneClient<T>({
      sdkKey: "test-sdk-key",
      baseUrl: "https://replane.my-host.com",
      fetchFn: mockServer.fetchFn,
      logger: silentLogger,
      ...options,
    });
  }

  describe("basic config fetching", () => {
    it("should fetch a single config", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "config1",
            overrides: [],
            version: 1,
            value: "value1",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("config1")).toBe("value1");
    });

    it("should fetch multiple configs", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          { name: "stringConfig", overrides: [], version: 1, value: "hello" },
          { name: "numberConfig", overrides: [], version: 1, value: 42 },
          { name: "booleanConfig", overrides: [], version: 1, value: true },
          { name: "objectConfig", overrides: [], version: 1, value: { key: "value" } },
          { name: "arrayConfig", overrides: [], version: 1, value: [1, 2, 3] },
          { name: "nullConfig", overrides: [], version: 1, value: null },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("stringConfig")).toBe("hello");
      expect(client.getConfig("numberConfig")).toBe(42);
      expect(client.getConfig("booleanConfig")).toBe(true);
      expect(client.getConfig("objectConfig")).toEqual({ key: "value" });
      expect(client.getConfig("arrayConfig")).toEqual([1, 2, 3]);
      expect(client.getConfig("nullConfig")).toBe(null);
    });

    it("should throw when getting non-existent config", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [{ name: "existing", overrides: [], version: 1, value: "test" }],
      });

      const client = await clientPromise;
      expect(() => client.getConfig("nonExistent")).toThrow(ReplaneError);
      expect(() => client.getConfig("nonExistent")).toThrow("Config not found: nonExistent");
    });

    it("should throw when client is closed", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [{ name: "config1", overrides: [], version: 1, value: "value1" }],
      });

      const client = await clientPromise;
      client.close();

      expect(() => client.getConfig("config1")).toThrow(ReplaneError);
      expect(() => client.getConfig("config1")).toThrow("Replane client is closed");
    });

    it("should handle empty config list", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [],
      });

      const client = await clientPromise;
      expect(() => client.getConfig("anyConfig")).toThrow("Config not found");
    });
  });

  describe("real-time config updates", () => {
    it("should handle config_created event", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [],
      });

      const client = await clientPromise;
      expect(() => client.getConfig("newConfig")).toThrow("Config not found");

      await connection.push({
        type: "config_created",
        configName: "newConfig",
        overrides: [],
        version: 1,
        value: "newValue",
      });
      await sync();

      expect(client.getConfig("newConfig")).toBe("newValue");
    });

    it("should handle config_updated event", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [{ name: "config1", overrides: [], version: 1, value: "oldValue" }],
      });

      const client = await clientPromise;
      expect(client.getConfig("config1")).toBe("oldValue");

      await connection.push({
        type: "config_updated",
        configName: "config1",
        overrides: [],
        version: 2,
        value: "newValue",
      });
      await sync();

      expect(client.getConfig("config1")).toBe("newValue");
    });

    it("should handle config_deleted event", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [{ name: "config1", overrides: [], version: 1, value: "value1" }],
      });

      const client = await clientPromise;
      expect(client.getConfig("config1")).toBe("value1");

      await connection.push({
        type: "config_deleted",
        configName: "config1",
        version: 2,
      });
      await sync();

      expect(() => client.getConfig("config1")).toThrow("Config not found");
    });

    it("should handle multiple sequential updates", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [{ name: "counter", overrides: [], version: 1, value: 0 }],
      });

      const client = await clientPromise;

      for (let i = 1; i <= 5; i++) {
        await connection.push({
          type: "config_updated",
          configName: "counter",
          overrides: [],
          version: i + 1,
          value: i,
        });
        await sync();
        expect(client.getConfig("counter")).toBe(i);
      }
    });
  });

  describe("overrides with equals operator", () => {
    it("should apply override when condition matches", async () => {
      clientPromise = createClient({ context: { environment: "production" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "prod-override",
                conditions: [{ operator: "equals", property: "environment", value: "production" }],
                value: "prod-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("prod-value");
    });

    it("should use base value when condition does not match", async () => {
      clientPromise = createClient({ context: { environment: "development" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "prod-override",
                conditions: [{ operator: "equals", property: "environment", value: "production" }],
                value: "prod-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("default-value");
    });

    it("should use base value when context property is missing (unknown)", async () => {
      clientPromise = createClient({ context: {} });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "override",
                conditions: [{ operator: "equals", property: "environment", value: "production" }],
                value: "override-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("default-value");
    });

    it("should apply first matching override when multiple exist", async () => {
      clientPromise = createClient({ context: { tier: "premium" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "premium-override",
                conditions: [{ operator: "equals", property: "tier", value: "premium" }],
                value: "premium-value",
              },
              {
                name: "basic-override",
                conditions: [{ operator: "equals", property: "tier", value: "basic" }],
                value: "basic-value",
              },
            ],
            version: 1,
            value: "free-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("premium-value");
    });
  });

  describe("overrides with in/not_in operators", () => {
    it("should apply override when value is in list", async () => {
      clientPromise = createClient({ context: { region: "us-east" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "us-override",
                conditions: [{ operator: "in", property: "region", value: ["us-east", "us-west"] }],
                value: "us-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("us-value");
    });

    it("should not apply override when value is not in list", async () => {
      clientPromise = createClient({ context: { region: "eu-west" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "us-override",
                conditions: [{ operator: "in", property: "region", value: ["us-east", "us-west"] }],
                value: "us-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("default-value");
    });

    it("should apply override when value is not in excluded list", async () => {
      clientPromise = createClient({ context: { region: "eu-west" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "non-us-override",
                conditions: [
                  { operator: "not_in", property: "region", value: ["us-east", "us-west"] },
                ],
                value: "non-us-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("non-us-value");
    });

    it("should not apply override when value is in excluded list", async () => {
      clientPromise = createClient({ context: { region: "us-east" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "non-us-override",
                conditions: [
                  { operator: "not_in", property: "region", value: ["us-east", "us-west"] },
                ],
                value: "non-us-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("default-value");
    });
  });

  describe("overrides with comparison operators", () => {
    it("should apply less_than override for numbers", async () => {
      clientPromise = createClient({ context: { age: 17 } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "minor-override",
                conditions: [{ operator: "less_than", property: "age", value: 18 }],
                value: "minor-value",
              },
            ],
            version: 1,
            value: "adult-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("minor-value");
    });

    it("should not apply less_than override when equal", async () => {
      clientPromise = createClient({ context: { age: 18 } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "minor-override",
                conditions: [{ operator: "less_than", property: "age", value: 18 }],
                value: "minor-value",
              },
            ],
            version: 1,
            value: "adult-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("adult-value");
    });

    it("should apply less_than_or_equal override when equal", async () => {
      clientPromise = createClient({ context: { age: 18 } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "young-override",
                conditions: [{ operator: "less_than_or_equal", property: "age", value: 18 }],
                value: "young-value",
              },
            ],
            version: 1,
            value: "old-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("young-value");
    });

    it("should apply greater_than override for numbers", async () => {
      clientPromise = createClient({ context: { score: 100 } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "high-score-override",
                conditions: [{ operator: "greater_than", property: "score", value: 50 }],
                value: "high-score-value",
              },
            ],
            version: 1,
            value: "low-score-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("high-score-value");
    });

    it("should apply greater_than_or_equal override when equal", async () => {
      clientPromise = createClient({ context: { score: 50 } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "high-score-override",
                conditions: [{ operator: "greater_than_or_equal", property: "score", value: 50 }],
                value: "high-score-value",
              },
            ],
            version: 1,
            value: "low-score-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("high-score-value");
    });

    it("should apply comparison operators for strings (lexicographic)", async () => {
      clientPromise = createClient({ context: { version: "2.0.0" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "new-version-override",
                conditions: [{ operator: "greater_than", property: "version", value: "1.9.0" }],
                value: "new-feature",
              },
            ],
            version: 1,
            value: "old-feature",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("new-feature");
    });
  });

  describe("overrides with composite conditions (and/or/not)", () => {
    it("should apply override when all AND conditions match", async () => {
      clientPromise = createClient({ context: { environment: "production", tier: "premium" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "premium-prod-override",
                conditions: [
                  {
                    operator: "and",
                    conditions: [
                      { operator: "equals", property: "environment", value: "production" },
                      { operator: "equals", property: "tier", value: "premium" },
                    ],
                  },
                ],
                value: "premium-prod-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("premium-prod-value");
    });

    it("should not apply override when any AND condition fails", async () => {
      clientPromise = createClient({ context: { environment: "production", tier: "basic" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "premium-prod-override",
                conditions: [
                  {
                    operator: "and",
                    conditions: [
                      { operator: "equals", property: "environment", value: "production" },
                      { operator: "equals", property: "tier", value: "premium" },
                    ],
                  },
                ],
                value: "premium-prod-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("default-value");
    });

    it("should apply override when any OR condition matches", async () => {
      clientPromise = createClient({ context: { tier: "premium" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "special-tier-override",
                conditions: [
                  {
                    operator: "or",
                    conditions: [
                      { operator: "equals", property: "tier", value: "premium" },
                      { operator: "equals", property: "tier", value: "enterprise" },
                    ],
                  },
                ],
                value: "special-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("special-value");
    });

    it("should not apply override when no OR conditions match", async () => {
      clientPromise = createClient({ context: { tier: "basic" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "special-tier-override",
                conditions: [
                  {
                    operator: "or",
                    conditions: [
                      { operator: "equals", property: "tier", value: "premium" },
                      { operator: "equals", property: "tier", value: "enterprise" },
                    ],
                  },
                ],
                value: "special-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("default-value");
    });

    it("should apply override with NOT condition (inverted match)", async () => {
      clientPromise = createClient({ context: { environment: "development" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "non-prod-override",
                conditions: [
                  {
                    operator: "not",
                    condition: { operator: "equals", property: "environment", value: "production" },
                  },
                ],
                value: "non-prod-value",
              },
            ],
            version: 1,
            value: "prod-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("non-prod-value");
    });

    it("should not apply override with NOT condition when inner matches", async () => {
      clientPromise = createClient({ context: { environment: "production" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "non-prod-override",
                conditions: [
                  {
                    operator: "not",
                    condition: { operator: "equals", property: "environment", value: "production" },
                  },
                ],
                value: "non-prod-value",
              },
            ],
            version: 1,
            value: "prod-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("prod-value");
    });

    it("should handle deeply nested composite conditions", async () => {
      clientPromise = createClient({
        context: { environment: "production", tier: "premium", region: "us-east" },
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "complex-override",
                conditions: [
                  {
                    operator: "and",
                    conditions: [
                      { operator: "equals", property: "environment", value: "production" },
                      {
                        operator: "or",
                        conditions: [
                          { operator: "equals", property: "tier", value: "premium" },
                          { operator: "equals", property: "tier", value: "enterprise" },
                        ],
                      },
                      {
                        operator: "not",
                        condition: { operator: "equals", property: "region", value: "eu-west" },
                      },
                    ],
                  },
                ],
                value: "complex-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("complex-value");
    });
  });

  describe("overrides with segmentation", () => {
    it("should apply segmentation override when hash falls within range", async () => {
      // Use a known userId that hashes into the 0-50% range with a specific seed
      clientPromise = createClient({ context: { userId: "user-in-segment" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "50-percent-rollout",
                conditions: [
                  {
                    operator: "segmentation",
                    property: "userId",
                    fromPercentage: 0,
                    toPercentage: 100, // 100% to ensure it always matches
                    seed: "test-seed",
                  },
                ],
                value: "rollout-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("rollout-value");
    });

    it("should not apply segmentation when property is undefined", async () => {
      clientPromise = createClient({ context: {} });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "rollout",
                conditions: [
                  {
                    operator: "segmentation",
                    property: "userId",
                    fromPercentage: 0,
                    toPercentage: 100,
                    seed: "test-seed",
                  },
                ],
                value: "rollout-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("default-value");
    });

    it("should exclude users with 0% segmentation range", async () => {
      clientPromise = createClient({ context: { userId: "any-user" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "zero-rollout",
                conditions: [
                  {
                    operator: "segmentation",
                    property: "userId",
                    fromPercentage: 0,
                    toPercentage: 0,
                    seed: "test-seed",
                  },
                ],
                value: "rollout-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("default-value");
    });

    it("should be deterministic for the same userId and seed", async () => {
      const overrides: RenderedOverride[] = [
        {
          name: "deterministic-rollout",
          conditions: [
            {
              operator: "segmentation",
              property: "userId",
              fromPercentage: 0,
              toPercentage: 50,
              seed: "stable-seed",
            },
          ],
          value: "rollout-value",
        },
      ];

      // Create client multiple times with the same userId
      const results: unknown[] = [];
      for (let i = 0; i < 3; i++) {
        const server = new MockReplaneServerController();
        const client = createReplaneClient({
          sdkKey: "test",
          baseUrl: "https://test.com",
          fetchFn: server.fetchFn,
          logger: silentLogger,
          context: { userId: "stable-user-123" },
        });

        const connection = await server.acceptConnection();
        await connection.push({
          type: "config_list",
          configs: [{ name: "feature", overrides, version: 1, value: "default-value" }],
        });

        const c = await client;
        results.push(c.getConfig("feature"));
        c.close();
        server.close();
      }

      // All results should be the same
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });
  });

  describe("context handling", () => {
    it("should use client-level context", async () => {
      clientPromise = createClient({ context: { environment: "production" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "prod-override",
                conditions: [{ operator: "equals", property: "environment", value: "production" }],
                value: "prod-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("prod-value");
    });

    it("should merge per-request context with client-level context", async () => {
      clientPromise = createClient({ context: { environment: "production" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "premium-prod-override",
                conditions: [
                  { operator: "equals", property: "environment", value: "production" },
                  { operator: "equals", property: "tier", value: "premium" },
                ],
                value: "premium-prod-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      // Per-request context adds 'tier' while 'environment' comes from client-level
      expect(client.getConfig("feature", { context: { tier: "premium" } })).toBe(
        "premium-prod-value"
      );
    });

    it("should override client-level context with per-request context", async () => {
      clientPromise = createClient({ context: { environment: "production" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "staging-override",
                conditions: [{ operator: "equals", property: "environment", value: "staging" }],
                value: "staging-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      // Per-request context overrides 'environment'
      expect(client.getConfig("feature", { context: { environment: "staging" } })).toBe(
        "staging-value"
      );
    });
  });

  describe("type casting in conditions", () => {
    it("should cast string to number when context value is number", async () => {
      clientPromise = createClient({ context: { age: 25 } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "age-override",
                conditions: [{ operator: "greater_than", property: "age", value: "18" }],
                value: "adult-value",
              },
            ],
            version: 1,
            value: "minor-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("adult-value");
    });

    it("should cast 'true' string to boolean when context value is boolean", async () => {
      clientPromise = createClient({ context: { isAdmin: true } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "admin-override",
                conditions: [{ operator: "equals", property: "isAdmin", value: "true" }],
                value: "admin-value",
              },
            ],
            version: 1,
            value: "user-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("admin-value");
    });

    it("should cast 'false' string to boolean when context value is boolean", async () => {
      clientPromise = createClient({ context: { isAdmin: false } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "non-admin-override",
                conditions: [{ operator: "equals", property: "isAdmin", value: "false" }],
                value: "non-admin-value",
              },
            ],
            version: 1,
            value: "admin-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("non-admin-value");
    });

    it("should cast number to string when context value is string", async () => {
      clientPromise = createClient({ context: { code: "42" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "code-override",
                conditions: [{ operator: "equals", property: "code", value: 42 }],
                value: "matched-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      expect(client.getConfig("feature")).toBe("matched-value");
    });
  });

  describe("fallback configs", () => {
    it("should use fallback config when initial list is empty", async () => {
      clientPromise = createClient({
        fallbackConfigs: {
          missingConfig: "fallback-value",
        },
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [],
      });

      const client = await clientPromise;
      expect(client.getConfig("missingConfig")).toBe("fallback-value");
    });

    it("should prefer server config over fallback config", async () => {
      clientPromise = createClient({
        fallbackConfigs: {
          config1: "fallback-value",
        },
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [{ name: "config1", overrides: [], version: 1, value: "server-value" }],
      });

      const client = await clientPromise;
      expect(client.getConfig("config1")).toBe("server-value");
    });

    it("should handle undefined fallback values (no fallback)", async () => {
      clientPromise = createClient({
        fallbackConfigs: {
          config1: "has-fallback",
          config2: undefined as unknown as string,
        },
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [],
      });

      const client = await clientPromise;
      expect(client.getConfig("config1")).toBe("has-fallback");
      expect(() => client.getConfig("config2")).toThrow("Config not found");
    });
  });

  describe("required configs", () => {
    it("should reject initialization when required config is missing", async () => {
      clientPromise = createClient({
        requiredConfigs: {
          requiredConfig: true,
        },
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [],
      });

      await expect(clientPromise).rejects.toThrow("Required configs not found: requiredConfig");
    });

    it("should initialize successfully when required config is present", async () => {
      clientPromise = createClient({
        requiredConfigs: {
          requiredConfig: true,
        },
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [{ name: "requiredConfig", overrides: [], version: 1, value: "value" }],
      });

      const client = await clientPromise;
      expect(client.getConfig("requiredConfig")).toBe("value");
    });

    it("should not require configs marked as false", async () => {
      clientPromise = createClient({
        requiredConfigs: {
          optionalConfig: false,
        },
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [],
      });

      const client = await clientPromise;
      expect(() => client.getConfig("optionalConfig")).toThrow("Config not found");
    });

    it("should not delete required configs when delete event is received", async () => {
      clientPromise = createClient({
        requiredConfigs: {
          requiredConfig: true,
        },
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [{ name: "requiredConfig", overrides: [], version: 1, value: "value" }],
      });

      const client = await clientPromise;

      await connection.push({
        type: "config_deleted",
        configName: "requiredConfig",
        version: 2,
      });
      await sync();

      // Should still have the config (delete prevented for required configs)
      expect(client.getConfig("requiredConfig")).toBe("value");
      expect(silentLogger.warn).toHaveBeenCalled();
    });

    it("should use fallback for missing required config", async () => {
      clientPromise = createClient({
        requiredConfigs: {
          requiredConfig: true,
        },
        fallbackConfigs: {
          requiredConfig: "fallback-value",
        },
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [],
      });

      const client = await clientPromise;
      expect(client.getConfig("requiredConfig")).toBe("fallback-value");
    });
  });

  describe("initialization timeout", () => {
    it("should timeout if no config_list is received", async () => {
      clientPromise = createClient({ timeoutMs: 100 });
      await mockServer.acceptConnection();
      // Don't send any events

      await expect(clientPromise).rejects.toThrow("Replane client initialization timed out");
    });
  });

  describe("closing behavior", () => {
    it("should be idempotent when closing multiple times", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "config_list",
        configs: [{ name: "config1", overrides: [], version: 1, value: "value1" }],
      });

      const client = await clientPromise;
      client.close();
      client.close();
      client.close();

      expect(() => client.getConfig("config1")).toThrow("Replane client is closed");
    });
  });
});

describe("createInMemoryReplaneClient", () => {
  it("should return config values from initial data", () => {
    const client = createInMemoryReplaneClient({
      stringConfig: "hello",
      numberConfig: 42,
      booleanConfig: true,
      objectConfig: { key: "value" },
    });

    expect(client.getConfig("stringConfig")).toBe("hello");
    expect(client.getConfig("numberConfig")).toBe(42);
    expect(client.getConfig("booleanConfig")).toBe(true);
    expect(client.getConfig("objectConfig")).toEqual({ key: "value" });

    client.close();
  });

  it("should throw when getting non-existent config", () => {
    const client = createInMemoryReplaneClient<Record<string, unknown>>({ existing: "value" });

    expect(() => client.getConfig("nonExistent")).toThrow("Config not found: nonExistent");

    client.close();
  });

  it("should throw when client is closed", () => {
    const client = createInMemoryReplaneClient({ config1: "value1" });
    client.close();

    expect(() => client.getConfig("config1")).toThrow("Replane client is closed");
  });

  it("should handle empty initial data", () => {
    const client = createInMemoryReplaneClient<Record<string, unknown>>({});

    expect(() => client.getConfig("anyConfig")).toThrow("Config not found");

    client.close();
  });

  it("should handle null and undefined values", () => {
    const client = createInMemoryReplaneClient({
      nullConfig: null,
    });

    expect(client.getConfig("nullConfig")).toBe(null);
    // Note: undefined is a valid value but getConfig checks for undefined as "not found"

    client.close();
  });
});
