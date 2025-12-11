import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createReplaneClient,
  createInMemoryReplaneClient,
  ReplaneClient,
  ReplaneError,
} from "../src/index";
import { MockReplaneServerController } from "./utils";

function sync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createSilentLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("createReplaneClient", () => {
  let mockServer: MockReplaneServerController;
  let clientPromise: Promise<ReplaneClient<Record<string, unknown>>>;
  let silentLogger: ReturnType<typeof createSilentLogger>;

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
        type: "init",
        configs: [{ name: "config1", overrides: [], version: 1, value: "value1" }],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("config1")).toBe("value1");
    });

    it("should fetch multiple configs", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          { name: "config1", overrides: [], version: 1, value: "value1" },
          { name: "config2", overrides: [], version: 1, value: 42 },
          { name: "config3", overrides: [], version: 1, value: true },
          { name: "config4", overrides: [], version: 1, value: { nested: "object" } },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("config1")).toBe("value1");
      expect(client.getConfig("config2")).toBe(42);
      expect(client.getConfig("config3")).toBe(true);
      expect(client.getConfig("config4")).toEqual({ nested: "object" });
    });

    it("should throw ReplaneError when config not found", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], version: 1, value: "value1" }],
      });

      const client = await clientPromise;
      await sync();

      expect(() => client.getConfig("nonexistent")).toThrow(ReplaneError);
      expect(() => client.getConfig("nonexistent")).toThrow("Config not found: nonexistent");
    });

    it("should handle config values of different types", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          { name: "string", overrides: [], version: 1, value: "hello" },
          { name: "number", overrides: [], version: 1, value: 123.45 },
          { name: "boolean", overrides: [], version: 1, value: false },
          { name: "null", overrides: [], version: 1, value: null },
          { name: "array", overrides: [], version: 1, value: [1, 2, 3] },
          { name: "object", overrides: [], version: 1, value: { key: "value" } },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("string")).toBe("hello");
      expect(client.getConfig("number")).toBe(123.45);
      expect(client.getConfig("boolean")).toBe(false);
      expect(client.getConfig("null")).toBe(null);
      expect(client.getConfig("array")).toEqual([1, 2, 3]);
      expect(client.getConfig("object")).toEqual({ key: "value" });
    });
  });

  describe("config changes via streaming", () => {
    it("should update config when config_change event is received", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], version: 1, value: "initial" }],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("config1")).toBe("initial");

      await connection.push({
        type: "config_change",
        configName: "config1",
        overrides: [],
        version: 2,
        value: "updated",
      });
      await sync();
      expect(client.getConfig("config1")).toBe("updated");
    });

    it("should add new config via config_change event", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], version: 1, value: "value1" }],
      });

      const client = await clientPromise;
      await sync();

      await connection.push({
        type: "config_change",
        configName: "config2",
        overrides: [],
        version: 1,
        value: "value2",
      });
      await sync();
      expect(client.getConfig("config2")).toBe("value2");
    });

    it("should handle multiple config changes", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          { name: "config1", overrides: [], version: 1, value: "v1" },
          { name: "config2", overrides: [], version: 1, value: "v2" },
        ],
      });

      const client = await clientPromise;
      await sync();

      await connection.push({
        type: "config_change",
        configName: "config1",
        overrides: [],
        version: 2,
        value: "v1-updated",
      });
      await connection.push({
        type: "config_change",
        configName: "config2",
        overrides: [],
        version: 2,
        value: "v2-updated",
      });
      await sync();

      expect(client.getConfig("config1")).toBe("v1-updated");
      expect(client.getConfig("config2")).toBe("v2-updated");
    });
  });

  describe("overrides with equals operator", () => {
    it("should return override value when condition matches", async () => {
      clientPromise = createClient({ context: { env: "production" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "prod-override",
                conditions: [{ operator: "equals", property: "env", value: "production" }],
                value: "prod-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("prod-value");
    });

    it("should return base value when condition does not match", async () => {
      clientPromise = createClient({ context: { env: "development" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "prod-override",
                conditions: [{ operator: "equals", property: "env", value: "production" }],
                value: "prod-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("default-value");
    });

    it("should return base value when context property is undefined", async () => {
      clientPromise = createClient({ context: {} });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "override",
                conditions: [{ operator: "equals", property: "env", value: "production" }],
                value: "override-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("default-value");
    });

    it("should use first matching override when multiple overrides exist", async () => {
      clientPromise = createClient({ context: { env: "staging" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "prod-override",
                conditions: [{ operator: "equals", property: "env", value: "production" }],
                value: "prod-value",
              },
              {
                name: "staging-override",
                conditions: [{ operator: "equals", property: "env", value: "staging" }],
                value: "staging-value",
              },
            ],
            version: 1,
            value: "default-value",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("staging-value");
    });
  });

  describe("overrides with in operator", () => {
    it("should match when value is in array", async () => {
      clientPromise = createClient({ context: { country: "US" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "north-america",
                conditions: [{ operator: "in", property: "country", value: ["US", "CA", "MX"] }],
                value: "na-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("na-value");
    });

    it("should not match when value is not in array", async () => {
      clientPromise = createClient({ context: { country: "UK" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "north-america",
                conditions: [{ operator: "in", property: "country", value: ["US", "CA", "MX"] }],
                value: "na-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("default");
    });
  });

  describe("overrides with not_in operator", () => {
    it("should match when value is not in array", async () => {
      clientPromise = createClient({ context: { country: "UK" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "not-north-america",
                conditions: [
                  { operator: "not_in", property: "country", value: ["US", "CA", "MX"] },
                ],
                value: "non-na-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("non-na-value");
    });

    it("should not match when value is in array", async () => {
      clientPromise = createClient({ context: { country: "US" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "not-north-america",
                conditions: [
                  { operator: "not_in", property: "country", value: ["US", "CA", "MX"] },
                ],
                value: "non-na-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("default");
    });
  });

  describe("overrides with comparison operators", () => {
    describe("less_than", () => {
      it("should match when context value is less than expected (numbers)", async () => {
        clientPromise = createClient({ context: { age: 17 } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "minor",
                  conditions: [{ operator: "less_than", property: "age", value: 18 }],
                  value: "minor-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("minor-value");
      });

      it("should not match when context value equals expected", async () => {
        clientPromise = createClient({ context: { age: 18 } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "minor",
                  conditions: [{ operator: "less_than", property: "age", value: 18 }],
                  value: "minor-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("default");
      });

      it("should compare strings lexicographically", async () => {
        clientPromise = createClient({ context: { name: "alice" } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [{ operator: "less_than", property: "name", value: "bob" }],
                  value: "override-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("override-value");
      });
    });

    describe("less_than_or_equal", () => {
      it("should match when context value equals expected", async () => {
        clientPromise = createClient({ context: { age: 18 } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [{ operator: "less_than_or_equal", property: "age", value: 18 }],
                  value: "override-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("override-value");
      });

      it("should match when context value is less than expected", async () => {
        clientPromise = createClient({ context: { age: 17 } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [{ operator: "less_than_or_equal", property: "age", value: 18 }],
                  value: "override-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("override-value");
      });
    });

    describe("greater_than", () => {
      it("should match when context value is greater than expected", async () => {
        clientPromise = createClient({ context: { age: 21 } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "adult",
                  conditions: [{ operator: "greater_than", property: "age", value: 18 }],
                  value: "adult-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("adult-value");
      });

      it("should not match when context value equals expected", async () => {
        clientPromise = createClient({ context: { age: 18 } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "adult",
                  conditions: [{ operator: "greater_than", property: "age", value: 18 }],
                  value: "adult-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("default");
      });
    });

    describe("greater_than_or_equal", () => {
      it("should match when context value equals expected", async () => {
        clientPromise = createClient({ context: { age: 18 } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [{ operator: "greater_than_or_equal", property: "age", value: 18 }],
                  value: "override-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("override-value");
      });

      it("should match when context value is greater than expected", async () => {
        clientPromise = createClient({ context: { age: 21 } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [{ operator: "greater_than_or_equal", property: "age", value: 18 }],
                  value: "override-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("override-value");
      });
    });
  });

  describe("overrides with composite conditions", () => {
    describe("and condition", () => {
      it("should match when all conditions are true", async () => {
        clientPromise = createClient({ context: { env: "production", country: "US" } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [
                    {
                      operator: "and",
                      conditions: [
                        { operator: "equals", property: "env", value: "production" },
                        { operator: "equals", property: "country", value: "US" },
                      ],
                    },
                  ],
                  value: "override-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("override-value");
      });

      it("should not match when one condition is false", async () => {
        clientPromise = createClient({ context: { env: "production", country: "UK" } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [
                    {
                      operator: "and",
                      conditions: [
                        { operator: "equals", property: "env", value: "production" },
                        { operator: "equals", property: "country", value: "US" },
                      ],
                    },
                  ],
                  value: "override-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("default");
      });

      it("should return unknown when one condition is unknown and others are true", async () => {
        clientPromise = createClient({ context: { env: "production" } }); // country missing
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [
                    {
                      operator: "and",
                      conditions: [
                        { operator: "equals", property: "env", value: "production" },
                        { operator: "equals", property: "country", value: "US" },
                      ],
                    },
                  ],
                  value: "override-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("default");
      });
    });

    describe("or condition", () => {
      it("should match when at least one condition is true", async () => {
        clientPromise = createClient({ context: { env: "staging" } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [
                    {
                      operator: "or",
                      conditions: [
                        { operator: "equals", property: "env", value: "production" },
                        { operator: "equals", property: "env", value: "staging" },
                      ],
                    },
                  ],
                  value: "override-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("override-value");
      });

      it("should not match when all conditions are false", async () => {
        clientPromise = createClient({ context: { env: "development" } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [
                    {
                      operator: "or",
                      conditions: [
                        { operator: "equals", property: "env", value: "production" },
                        { operator: "equals", property: "env", value: "staging" },
                      ],
                    },
                  ],
                  value: "override-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("default");
      });
    });

    describe("not condition", () => {
      it("should match when inner condition is false", async () => {
        clientPromise = createClient({ context: { env: "development" } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [
                    {
                      operator: "not",
                      condition: { operator: "equals", property: "env", value: "production" },
                    },
                  ],
                  value: "non-prod-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("non-prod-value");
      });

      it("should not match when inner condition is true", async () => {
        clientPromise = createClient({ context: { env: "production" } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [
                    {
                      operator: "not",
                      condition: { operator: "equals", property: "env", value: "production" },
                    },
                  ],
                  value: "non-prod-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("default");
      });

      it("should return unknown when inner condition is unknown", async () => {
        clientPromise = createClient({ context: {} }); // env missing
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [
                    {
                      operator: "not",
                      condition: { operator: "equals", property: "env", value: "production" },
                    },
                  ],
                  value: "non-prod-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("default");
      });
    });

    describe("multiple conditions in override (implicit AND)", () => {
      it("should require all conditions in override to match", async () => {
        clientPromise = createClient({ context: { env: "production", role: "admin" } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [
                    { operator: "equals", property: "env", value: "production" },
                    { operator: "equals", property: "role", value: "admin" },
                  ],
                  value: "admin-prod-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("admin-prod-value");
      });

      it("should not match if any condition fails in override", async () => {
        clientPromise = createClient({ context: { env: "production", role: "user" } });
        const connection = await mockServer.acceptConnection();
        await connection.push({
          type: "init",
          configs: [
            {
              name: "feature",
              overrides: [
                {
                  name: "override",
                  conditions: [
                    { operator: "equals", property: "env", value: "production" },
                    { operator: "equals", property: "role", value: "admin" },
                  ],
                  value: "admin-prod-value",
                },
              ],
              version: 1,
              value: "default",
            },
          ],
        });

        const client = await clientPromise;
        await sync();
        expect(client.getConfig("feature")).toBe("default");
      });
    });
  });

  describe("overrides with segmentation", () => {
    it("should evaluate segmentation based on hash", async () => {
      // This test uses a specific user ID that should fall in the 0-50% bucket
      clientPromise = createClient({ context: { userId: "user-abc" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "50-percent",
                conditions: [
                  {
                    operator: "segmentation",
                    property: "userId",
                    fromPercentage: 0,
                    toPercentage: 100,
                    seed: "test-seed",
                  },
                ],
                value: "in-segment",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      // With 100% rollout, should always match
      expect(client.getConfig("feature")).toBe("in-segment");
    });

    it("should return unknown when segmentation property is undefined", async () => {
      clientPromise = createClient({ context: {} });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "50-percent",
                conditions: [
                  {
                    operator: "segmentation",
                    property: "userId",
                    fromPercentage: 0,
                    toPercentage: 50,
                    seed: "test-seed",
                  },
                ],
                value: "in-segment",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("default");
    });

    it("should return unknown when segmentation property is null", async () => {
      clientPromise = createClient({ context: { userId: null } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "50-percent",
                conditions: [
                  {
                    operator: "segmentation",
                    property: "userId",
                    fromPercentage: 0,
                    toPercentage: 50,
                    seed: "test-seed",
                  },
                ],
                value: "in-segment",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("default");
    });

    it("should not match when percentage is 0", async () => {
      clientPromise = createClient({ context: { userId: "any-user" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "zero-percent",
                conditions: [
                  {
                    operator: "segmentation",
                    property: "userId",
                    fromPercentage: 0,
                    toPercentage: 0,
                    seed: "test-seed",
                  },
                ],
                value: "in-segment",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("default");
    });
  });

  describe("context overriding", () => {
    it("should allow per-request context override", async () => {
      clientPromise = createClient({ context: { env: "production" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "staging",
                conditions: [{ operator: "equals", property: "env", value: "staging" }],
                value: "staging-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("default");
      expect(client.getConfig("feature", { context: { env: "staging" } })).toBe("staging-value");
    });

    it("should merge per-request context with client context", async () => {
      clientPromise = createClient({ context: { env: "production" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "override",
                conditions: [
                  {
                    operator: "and",
                    conditions: [
                      { operator: "equals", property: "env", value: "production" },
                      { operator: "equals", property: "role", value: "admin" },
                    ],
                  },
                ],
                value: "admin-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("default");
      expect(client.getConfig("feature", { context: { role: "admin" } })).toBe("admin-value");
    });

    it("should allow per-request context to override client context", async () => {
      clientPromise = createClient({ context: { env: "production" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "prod",
                conditions: [{ operator: "equals", property: "env", value: "production" }],
                value: "prod-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("prod-value");
      expect(client.getConfig("feature", { context: { env: "development" } })).toBe("default");
    });
  });

  describe("type casting in conditions", () => {
    it("should cast string to number when context is number", async () => {
      clientPromise = createClient({ context: { age: 25 } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "override",
                conditions: [{ operator: "equals", property: "age", value: "25" }],
                value: "override-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("override-value");
    });

    it("should cast string 'true' to boolean when context is boolean", async () => {
      clientPromise = createClient({ context: { isEnabled: true } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "override",
                conditions: [{ operator: "equals", property: "isEnabled", value: "true" }],
                value: "override-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("override-value");
    });

    it("should cast string 'false' to boolean when context is boolean", async () => {
      clientPromise = createClient({ context: { isEnabled: false } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "override",
                conditions: [{ operator: "equals", property: "isEnabled", value: "false" }],
                value: "override-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("override-value");
    });

    it("should cast number to boolean when context is boolean", async () => {
      clientPromise = createClient({ context: { isEnabled: true } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "override",
                conditions: [{ operator: "equals", property: "isEnabled", value: 1 }],
                value: "override-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("override-value");
    });

    it("should cast number to string when context is string", async () => {
      clientPromise = createClient({ context: { code: "123" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "override",
                conditions: [{ operator: "equals", property: "code", value: 123 }],
                value: "override-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("override-value");
    });

    it("should cast boolean to string when context is string", async () => {
      clientPromise = createClient({ context: { flag: "true" } });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          {
            name: "feature",
            overrides: [
              {
                name: "override",
                conditions: [{ operator: "equals", property: "flag", value: true }],
                value: "override-value",
              },
            ],
            version: 1,
            value: "default",
          },
        ],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("feature")).toBe("override-value");
    });
  });

  describe("initialization and fallbacks", () => {
    it("should throw error when SDK key is missing", async () => {
      await expect(
        createReplaneClient({
          sdkKey: "",
          baseUrl: "https://replane.my-host.com",
          fetchFn: mockServer.fetchFn,
          logger: silentLogger,
        })
      ).rejects.toThrow("SDK key is required");
    });

    it("should use fallbacks and timeout when server does not respond", async () => {
      clientPromise = createClient({
        fallbacks: { config1: "fallback-value" },
        sdkInitializationTimeoutMs: 50,
      });

      // Don't push any events - let it timeout
      const client = await clientPromise;
      expect(client.getConfig("config1")).toBe("fallback-value");
    });

    it("should throw timeout error when no fallbacks and server does not respond", async () => {
      clientPromise = createClient({
        sdkInitializationTimeoutMs: 50,
      });

      await expect(clientPromise).rejects.toThrow("Replane client initialization timed out");
    });

    it("should throw error when required config is missing from fallbacks", async () => {
      clientPromise = createClient({
        fallbacks: { config1: "fallback-value" },
        required: ["config1", "config2"],
        sdkInitializationTimeoutMs: 50,
      });

      await expect(clientPromise).rejects.toThrow("Required configs are missing: config2");
    });

    it("should succeed when all required configs are in fallbacks", async () => {
      clientPromise = createClient({
        fallbacks: { config1: "fallback1", config2: "fallback2" },
        required: ["config1", "config2"],
        sdkInitializationTimeoutMs: 50,
      });

      const client = await clientPromise;
      expect(client.getConfig("config1")).toBe("fallback1");
      expect(client.getConfig("config2")).toBe("fallback2");
    });

    it("should override fallbacks with server values", async () => {
      clientPromise = createClient({
        fallbacks: { config1: "fallback-value" },
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], version: 1, value: "server-value" }],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("config1")).toBe("server-value");
    });

    it("should accept required as object format", async () => {
      clientPromise = createClient({
        fallbacks: { config1: "fallback1", config2: "fallback2" },
        required: { config1: true, config2: true },
        sdkInitializationTimeoutMs: 50,
      });

      const client = await clientPromise;
      expect(client.getConfig("config1")).toBe("fallback1");
    });

    it("should handle empty required array", async () => {
      clientPromise = createClient({
        fallbacks: { config1: "fallback1" },
        required: [],
        sdkInitializationTimeoutMs: 50,
      });

      const client = await clientPromise;
      expect(client.getConfig("config1")).toBe("fallback1");
    });
  });

  describe("base URL normalization", () => {
    it("should strip trailing slashes from base URL", async () => {
      clientPromise = createClient({
        baseUrl: "https://replane.my-host.com///",
      });
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], version: 1, value: "value1" }],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("config1")).toBe("value1");
    });
  });

  describe("client close", () => {
    it("should stop receiving updates after close", async () => {
      clientPromise = createClient();
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], version: 1, value: "initial" }],
      });

      const client = await clientPromise;
      await sync();
      expect(client.getConfig("config1")).toBe("initial");

      client.close();
      await sync();

      // This shouldn't update the config
      await connection.push({
        type: "config_change",
        configName: "config1",
        overrides: [],
        version: 2,
        value: "updated",
      });
      await sync();

      // Config should still be initial since client is closed
      expect(client.getConfig("config1")).toBe("initial");
    });
  });
});

describe("createInMemoryReplaneClient", () => {
  it("should return config values from initial data", () => {
    const client = createInMemoryReplaneClient({
      config1: "value1",
      config2: 42,
      config3: true,
    });

    expect(client.getConfig("config1")).toBe("value1");
    expect(client.getConfig("config2")).toBe(42);
    expect(client.getConfig("config3")).toBe(true);
  });

  it("should throw ReplaneError when config not found", () => {
    const client = createInMemoryReplaneClient({
      config1: "value1",
    });

    expect(() => client.getConfig("nonexistent" as never)).toThrow(ReplaneError);
    expect(() => client.getConfig("nonexistent" as never)).toThrow("Config not found: nonexistent");
  });

  it("should handle complex values", () => {
    const client = createInMemoryReplaneClient({
      array: [1, 2, 3],
      object: { nested: { deep: "value" } },
      null: null,
    });

    expect(client.getConfig("array")).toEqual([1, 2, 3]);
    expect(client.getConfig("object")).toEqual({ nested: { deep: "value" } });
    expect(client.getConfig("null")).toBe(null);
  });

  it("should have a no-op close method", () => {
    const client = createInMemoryReplaneClient({ config1: "value1" });

    expect(() => client.close()).not.toThrow();
    // Config should still work after close
    expect(client.getConfig("config1")).toBe("value1");
  });
});

describe("ReplaneError", () => {
  it("should have correct name and code", () => {
    const error = new ReplaneError({
      message: "test message",
      code: "test_code",
    });

    expect(error.name).toBe("ReplaneError");
    expect(error.code).toBe("test_code");
    expect(error.message).toBe("test message");
  });

  it("should preserve cause", () => {
    const cause = new Error("original error");
    const error = new ReplaneError({
      message: "wrapped error",
      code: "wrapped",
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});
