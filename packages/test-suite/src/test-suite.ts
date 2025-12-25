/**
 * Replane E2E Test Suite
 *
 * Comprehensive test suite for testing @replanejs/sdk with real @replanejs/admin API
 *
 * NOTE: This test suite is designed for multi-server setups where admin API and edge API
 * may be on different servers. Config changes are not immediate and require waiting for
 * replication to complete.
 */

import { describe, it, beforeAll, afterAll, afterEach, expect } from "vitest";
import { ReplaneAdmin, type ConfigValue, type Override } from "@replanejs/admin";
import { createReplaneClient, ReplaneError, ReplaneErrorCode } from "@replanejs/sdk";
import type { ReplaneClient, ReplaneContext } from "@replanejs/sdk";
import type { TestSuiteOptions, TestContext } from "./types";
import { createSignal, createCollector, delay, uniqueId, syncReplica } from "./utils";

/**
 * Helper to create a literal value for conditions.
 */
function literal<T>(value: T) {
  return { type: "literal" as const, value };
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Creates a test context with helper methods
 */
function createTestContext(
  admin: ReplaneAdmin,
  workspaceId: string,
  projectId: string,
  environmentId: string,
  sdkKey: string,
  options: TestSuiteOptions
): TestContext {
  const defaultTimeout = options.defaultTimeout ?? 10000;

  function sync(): Promise<void> {
    return syncReplica({ edgeApiBaseUrl: options.edgeApiBaseUrl, sdkKey });
  }

  return {
    admin,
    workspaceId,
    projectId,
    environmentId,
    sdkKey,
    edgeApiBaseUrl: options.edgeApiBaseUrl,
    adminApiBaseUrl: options.adminApiBaseUrl,
    defaultTimeout,

    sync,

    async createClient<T extends object = Record<string, unknown>>(clientOptions?: {
      context?: ReplaneContext;
      defaults?: Partial<T>;
      required?: (keyof T)[] | Partial<T>;
    }): Promise<ReplaneClient<T>> {
      await sync();

      return createReplaneClient<T>({
        sdkKey,
        baseUrl: options.edgeApiBaseUrl,
        logger: options.debug ? console : silentLogger,
        initializationTimeoutMs: defaultTimeout,
        context: clientOptions?.context,
        defaults: clientOptions?.defaults as T | undefined,
        required: clientOptions?.required as (keyof T)[] | undefined,
      });
    },

    async createConfig(
      name: string,
      value: ConfigValue,
      configOptions?: {
        description?: string;
        overrides?: Override[];
      }
    ): Promise<void> {
      await admin.configs.create({
        projectId,
        name,
        description: configOptions?.description ?? "",
        editors: [],
        maintainers: [],
        base: {
          value,
          schema: null,
          overrides: configOptions?.overrides ?? [],
        },
        variants: [],
      });
      await sync();
    },

    async updateConfig(
      name: string,
      value: ConfigValue,
      configOptions?: {
        description?: string;
        overrides?: Override[];
      }
    ): Promise<void> {
      await admin.configs.update({
        projectId,
        configName: name,
        description: configOptions?.description ?? "",
        editors: [],
        base: {
          value,
          schema: null,
          overrides: configOptions?.overrides ?? [],
        },
        variants: [],
      });
      await sync();
    },

    async deleteConfig(name: string): Promise<void> {
      await admin.configs.delete({ projectId, configName: name });
      await sync();
    },
  };
}

/**
 * Main test suite function
 *
 * @example
 * ```ts
 * import { testSuite } from "@replanejs/test-suite";
 *
 * testSuite({
 *   superadminKey: process.env.SUPERADMIN_KEY!,
 *   adminApiBaseUrl: "http://localhost:8080",
 *   edgeApiBaseUrl: "http://localhost:8080",
 * });
 * ```
 */
export function testSuite(options: TestSuiteOptions): void {
  const { superadminKey, adminApiBaseUrl, edgeApiBaseUrl } = options;
  const defaultTimeout = options.defaultTimeout ?? 10000;

  describe("Replane E2E Test Suite", () => {
    let admin: ReplaneAdmin;
    let workspaceId: string;
    let projectId: string;
    let environmentId: string;
    let sdkKey: string;
    let ctx: TestContext;

    // Track clients for cleanup
    const activeClients: ReplaneClient<Record<string, unknown>>[] = [];

    beforeAll(async () => {
      // Create admin client with superadmin key
      admin = new ReplaneAdmin({
        apiKey: superadminKey,
        baseUrl: adminApiBaseUrl,
      });

      // Create a unique workspace for this test run
      const workspaceName = uniqueId("e2e-workspace");
      const workspaceRes = await admin.workspaces.create({ name: workspaceName });
      workspaceId = workspaceRes.id;

      // Create a project in the workspace
      const projectName = uniqueId("e2e-project");
      const projectRes = await admin.projects.create({
        workspaceId,
        name: projectName,
        description: "E2E test project",
      });
      projectId = projectRes.id;

      // Get environments (use production)
      const envRes = await admin.environments.list({ projectId });
      const prodEnv =
        envRes.environments.find((e) => e.name === "Production") ?? envRes.environments[0];
      if (!prodEnv) {
        throw new Error("No environments found");
      }
      environmentId = prodEnv.id;

      // Create SDK key
      const sdkKeyRes = await admin.sdkKeys.create({
        projectId,
        name: uniqueId("e2e-sdk-key"),
        environmentId,
      });
      sdkKey = sdkKeyRes.key;

      await syncReplica({ edgeApiBaseUrl, sdkKey });

      // Create test context
      ctx = createTestContext(admin, workspaceId, projectId, environmentId, sdkKey, options);
    });

    afterAll(async () => {
      // Close all active clients
      for (const client of activeClients) {
        try {
          client.close();
        } catch {
          // Ignore errors during cleanup
        }
      }
      activeClients.length = 0;

      // Clean up: delete workspace (cascades to project, configs, keys)
      if (workspaceId) {
        await admin.workspaces.delete({ workspaceId });
      }
    });

    // Helper to track clients for cleanup
    const trackClient = <T extends object>(client: ReplaneClient<T>): ReplaneClient<T> => {
      activeClients.push(client as ReplaneClient<Record<string, unknown>>);
      return client;
    };

    afterEach(async () => {
      const configs = await admin.configs.list({ projectId });
      for (const config of configs.configs) {
        await admin.configs.delete({ projectId, configName: config.name });
      }
      await syncReplica({ edgeApiBaseUrl, sdkKey });
    });

    // ==================== CONNECTION TESTS ====================

    describe("SDK Connection", () => {
      it("should connect and receive initial configs", async () => {
        // Create config via admin API
        await ctx.createConfig("test-config", "initial-value");

        // Create client - sync ensures configs are available
        const client = trackClient(
          await ctx.createClient<{ "test-config": string }>({
            required: ["test-config"],
          })
        );

        const value = client.get("test-config");
        expect(value).toBe("initial-value");

        client.close();
      });

      it("should handle empty project (no configs)", async () => {
        // Create a new project with no configs
        const emptyProjectRes = await admin.projects.create({
          workspaceId,
          name: uniqueId("empty-project"),
          description: "Empty project for testing",
        });
        const emptyEnvRes = await admin.environments.list({ projectId: emptyProjectRes.id });
        const emptyEnv = emptyEnvRes.environments[0];
        const emptySdkKeyRes = await admin.sdkKeys.create({
          projectId: emptyProjectRes.id,
          name: uniqueId("empty-sdk-key"),
          environmentId: emptyEnv.id,
        });

        // Wait for SDK key to sync
        await syncReplica({ edgeApiBaseUrl, sdkKey });

        const client = trackClient(
          await createReplaneClient({
            sdkKey: emptySdkKeyRes.key,
            baseUrl: edgeApiBaseUrl,
            logger: silentLogger,
            initializationTimeoutMs: defaultTimeout,
          })
        );

        // Should not throw, but get() with no default should throw
        expect(() => client.get("nonexistent")).toThrow();

        client.close();

        // Cleanup
        await admin.projects.delete({ projectId: emptyProjectRes.id });
      });

      it("should use default values when config not found", async () => {
        const client = trackClient(
          await ctx.createClient({
            defaults: { "missing-config": "default-value" },
          })
        );

        const value = client.get("missing-config");
        expect(value).toBe("default-value");

        client.close();
      });

      it("should throw when required config is missing", { timeout: 15000 }, async () => {
        await expect(
          ctx.createClient({
            required: ["definitely-missing-config"],
          })
        ).rejects.toThrow();
      });
    });

    // ==================== GET CONFIG TESTS ====================

    describe("Get Config", () => {
      it("should get string config", async () => {
        await ctx.createConfig("string-config", "hello");

        const client = trackClient(
          await ctx.createClient<{ "string-config": string }>({ required: ["string-config"] })
        );

        expect(client.get("string-config")).toBe("hello");
        client.close();
      });

      it("should get number config", async () => {
        await ctx.createConfig("number-config", 42);

        const client = trackClient(
          await ctx.createClient<{ "number-config": number }>({ required: ["number-config"] })
        );

        expect(client.get("number-config")).toBe(42);
        client.close();
      });

      it("should get boolean config", async () => {
        await ctx.createConfig("boolean-config", true);

        const client = trackClient(
          await ctx.createClient<{ "boolean-config": boolean }>({ required: ["boolean-config"] })
        );

        expect(client.get("boolean-config")).toBe(true);
        client.close();
      });

      it("should get object config", async () => {
        const objValue = { nested: { value: "deep" } };
        await ctx.createConfig("object-config", objValue);

        const client = trackClient(
          await ctx.createClient<{ "object-config": typeof objValue }>({
            required: ["object-config"],
          })
        );

        expect(client.get("object-config")).toEqual(objValue);
        client.close();
      });

      it("should get array config", async () => {
        const arrValue = [1, 2, 3];
        await ctx.createConfig("array-config", arrValue);

        const client = trackClient(
          await ctx.createClient<{ "array-config": number[] }>({ required: ["array-config"] })
        );

        expect(client.get("array-config")).toEqual(arrValue);
        client.close();
      });

      it("should get null config", async () => {
        await ctx.createConfig("null-config", null);

        const client = trackClient(
          await ctx.createClient<{ "null-config": null }>({ required: ["null-config"] })
        );

        expect(client.get("null-config")).toBe(null);
        client.close();
      });

      it("should return default value when config not found", async () => {
        const client = trackClient(await ctx.createClient());
        const value = client.get("nonexistent", { default: "fallback" });
        expect(value).toBe("fallback");
        client.close();
      });

      it("should throw ReplaneError when config not found and no default", async () => {
        const client = trackClient(await ctx.createClient());
        try {
          client.get("nonexistent");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(ReplaneError);
          expect((error as ReplaneError).code).toBe(ReplaneErrorCode.NotFound);
        }
        client.close();
      });
    });

    // ==================== REAL-TIME UPDATES TESTS ====================

    describe("Real-time Updates", () => {
      it("should receive config updates via subscription", async () => {
        await ctx.createConfig("live-config", "initial");

        const client = trackClient(
          await ctx.createClient<{ "live-config": string }>({ required: ["live-config"] })
        );

        expect(client.get("live-config")).toBe("initial");

        // Set up signal for next update
        const updateSignal = createSignal<string>();
        client.subscribe("live-config", (config) => {
          if (config.value !== "initial") {
            updateSignal.trigger(config.value as string);
          }
        });

        // Update config
        await ctx.updateConfig("live-config", "updated");

        // Wait for update (with timeout)
        const newValue = await updateSignal.wait({ timeout: defaultTimeout });
        expect(newValue).toBe("updated");

        // Verify get() returns new value
        expect(client.get("live-config")).toBe("updated");

        client.close();
      });

      it("should receive multiple updates in order", async () => {
        await ctx.createConfig("multi-update-config", 0);

        const client = trackClient(
          await ctx.createClient<{ "multi-update-config": number }>({
            required: ["multi-update-config"],
          })
        );

        expect(client.get("multi-update-config")).toBe(0);

        const collector = createCollector<number>();
        client.subscribe("multi-update-config", (config) => {
          const val = config.value as number;
          if (val > 0) {
            collector.push(val);
          }
        });

        // Send multiple updates with small delays to ensure ordering
        await ctx.updateConfig("multi-update-config", 1);
        await delay(100);
        await ctx.updateConfig("multi-update-config", 2);
        await delay(100);
        await ctx.updateConfig("multi-update-config", 3);

        // Wait for all updates
        const values = await collector.waitForCount(3, { timeout: defaultTimeout });
        expect(values).toEqual([1, 2, 3]);

        client.close();
      });

      it("should handle rapid updates", async () => {
        await ctx.createConfig("rapid-config", 0);

        const client = trackClient(
          await ctx.createClient<{ "rapid-config": number }>({ required: ["rapid-config"] })
        );

        expect(client.get("rapid-config")).toBe(0);

        const collector = createCollector<number>();
        client.subscribe("rapid-config", (config) => {
          collector.push(config.value as number);
        });

        // Send rapid updates
        const updateCount = 10;
        for (let i = 1; i <= updateCount; i++) {
          await ctx.updateConfig("rapid-config", i);
        }

        // Wait for final value (may not get all intermediate values due to batching)
        await collector.waitFor((v) => v === updateCount, { timeout: defaultTimeout });

        // Final value should be correct
        expect(client.get("rapid-config")).toBe(updateCount);

        client.close();
      });

      it("should call global subscription for any config change", async () => {
        await ctx.createConfig("config-a", "a");
        await ctx.createConfig("config-b", "b");

        const client = trackClient(
          await ctx.createClient<{ "config-a": string; "config-b": string }>({
            required: ["config-a", "config-b"],
          })
        );

        expect(client.get("config-a")).toBe("a");
        expect(client.get("config-b")).toBe("b");

        const collector = createCollector<{ name: unknown; value: unknown }>();
        client.subscribe((config) => {
          // Only collect updates (not initial values)
          if (config.value === "a-updated" || config.value === "b-updated") {
            collector.push({ name: config.name, value: config.value });
          }
        });

        // Update both configs
        await ctx.updateConfig("config-a", "a-updated");
        await ctx.updateConfig("config-b", "b-updated");

        // Wait for both updates
        await collector.waitForCount(2, { timeout: defaultTimeout });

        const values = collector.getValues();
        const aUpdate = values.find((v) => v.name === "config-a");
        const bUpdate = values.find((v) => v.name === "config-b");

        expect(aUpdate?.value).toBe("a-updated");
        expect(bUpdate?.value).toBe("b-updated");

        client.close();
      });

      it("should allow unsubscribing", async () => {
        await ctx.createConfig("unsub-config", "initial");

        const client = trackClient(
          await ctx.createClient<{ "unsub-config": string }>({ required: ["unsub-config"] })
        );

        expect(client.get("unsub-config")).toBe("initial");

        const collector = createCollector<string>();
        const unsubscribe = client.subscribe("unsub-config", (config) => {
          if (config.value !== "initial") {
            collector.push(config.value as string);
          }
        });

        // First update should be received
        await ctx.updateConfig("unsub-config", "update-1");
        await collector.waitForCount(1, { timeout: defaultTimeout });

        // Unsubscribe
        unsubscribe();

        // Second update should NOT be received
        await ctx.updateConfig("unsub-config", "update-2");
        await delay(2000); // Give time for potential update to propagate

        // Should only have 1 update
        expect(collector.count()).toBe(1);

        client.close();
      });
    });

    // ==================== OVERRIDE TESTS ====================

    describe("Override Evaluation", () => {
      it("should evaluate equals condition", async () => {
        await ctx.createConfig("env-config", "default", {
          overrides: [
            {
              name: "prod-override",
              conditions: [{ operator: "equals", property: "env", value: literal("production") }],
              value: "production-value",
            },
          ],
        });

        // Without context - should get default
        const client1 = trackClient(
          await ctx.createClient<{ "env-config": string }>({ required: ["env-config"] })
        );
        expect(client1.get("env-config")).toBe("default");
        client1.close();

        // With matching context
        const client2 = trackClient(
          await ctx.createClient<{ "env-config": string }>({
            context: { env: "production" },
            required: ["env-config"],
          })
        );
        expect(client2.get("env-config")).toBe("production-value");
        client2.close();

        // With non-matching context
        const client3 = trackClient(
          await ctx.createClient<{ "env-config": string }>({
            context: { env: "staging" },
            required: ["env-config"],
          })
        );
        expect(client3.get("env-config")).toBe("default");
        client3.close();
      });

      it("should evaluate in condition", async () => {
        await ctx.createConfig("region-config", "default", {
          overrides: [
            {
              name: "western-override",
              conditions: [{ operator: "in", property: "region", value: literal(["us", "eu"]) }],
              value: "western",
            },
          ],
        });

        const client1 = trackClient(
          await ctx.createClient<{ "region-config": string }>({
            context: { region: "us" },
            required: ["region-config"],
          })
        );
        expect(client1.get("region-config")).toBe("western");
        client1.close();

        const client2 = trackClient(
          await ctx.createClient<{ "region-config": string }>({
            context: { region: "eu" },
            required: ["region-config"],
          })
        );
        expect(client2.get("region-config")).toBe("western");
        client2.close();

        const client3 = trackClient(
          await ctx.createClient<{ "region-config": string }>({
            context: { region: "asia" },
            required: ["region-config"],
          })
        );
        expect(client3.get("region-config")).toBe("default");
        client3.close();
      });

      it("should evaluate not_in condition", async () => {
        await ctx.createConfig("allow-config", "allowed", {
          overrides: [
            {
              name: "not-blocked-override",
              conditions: [
                {
                  operator: "not_in",
                  property: "country",
                  value: literal(["blocked1", "blocked2"]),
                },
              ],
              value: "not-blocked",
            },
          ],
        });

        const client1 = trackClient(
          await ctx.createClient<{ "allow-config": string }>({
            context: { country: "blocked1" },
            required: ["allow-config"],
          })
        );
        expect(client1.get("allow-config")).toBe("allowed");
        client1.close();

        const client2 = trackClient(
          await ctx.createClient<{ "allow-config": string }>({
            context: { country: "normal" },
            required: ["allow-config"],
          })
        );
        expect(client2.get("allow-config")).toBe("not-blocked");
        client2.close();
      });

      it("should evaluate numeric comparison conditions", async () => {
        await ctx.createConfig("tier-config", "free", {
          overrides: [
            {
              name: "premium-override",
              conditions: [
                { operator: "greater_than_or_equal", property: "level", value: literal(10) },
              ],
              value: "premium",
            },
          ],
        });

        const client1 = trackClient(
          await ctx.createClient<{ "tier-config": string }>({
            context: { level: 5 },
            required: ["tier-config"],
          })
        );
        expect(client1.get("tier-config")).toBe("free");
        client1.close();

        const client2 = trackClient(
          await ctx.createClient<{ "tier-config": string }>({
            context: { level: 10 },
            required: ["tier-config"],
          })
        );
        expect(client2.get("tier-config")).toBe("premium");
        client2.close();

        const client3 = trackClient(
          await ctx.createClient<{ "tier-config": string }>({
            context: { level: 15 },
            required: ["tier-config"],
          })
        );
        expect(client3.get("tier-config")).toBe("premium");
        client3.close();
      });

      it("should evaluate and condition", async () => {
        await ctx.createConfig("combo-config", "default", {
          overrides: [
            {
              name: "combo-override",
              conditions: [
                {
                  operator: "and",
                  conditions: [
                    { operator: "equals", property: "plan", value: literal("enterprise") },
                    { operator: "equals", property: "verified", value: literal(true) },
                  ],
                },
              ],
              value: "enterprise-verified",
            },
          ],
        });

        // Both conditions must match
        const client1 = trackClient(
          await ctx.createClient<{ "combo-config": string }>({
            context: { plan: "enterprise", verified: true },
            required: ["combo-config"],
          })
        );
        expect(client1.get("combo-config")).toBe("enterprise-verified");
        client1.close();

        // Only one matches
        const client2 = trackClient(
          await ctx.createClient<{ "combo-config": string }>({
            context: { plan: "enterprise", verified: false },
            required: ["combo-config"],
          })
        );
        expect(client2.get("combo-config")).toBe("default");
        client2.close();
      });

      it("should evaluate or condition", async () => {
        await ctx.createConfig("either-config", "default", {
          overrides: [
            {
              name: "privileged-override",
              conditions: [
                {
                  operator: "or",
                  conditions: [
                    { operator: "equals", property: "role", value: literal("admin") },
                    { operator: "equals", property: "role", value: literal("superadmin") },
                  ],
                },
              ],
              value: "privileged",
            },
          ],
        });

        const client1 = trackClient(
          await ctx.createClient<{ "either-config": string }>({
            context: { role: "admin" },
            required: ["either-config"],
          })
        );
        expect(client1.get("either-config")).toBe("privileged");
        client1.close();

        const client2 = trackClient(
          await ctx.createClient<{ "either-config": string }>({
            context: { role: "superadmin" },
            required: ["either-config"],
          })
        );
        expect(client2.get("either-config")).toBe("privileged");
        client2.close();

        const client3 = trackClient(
          await ctx.createClient<{ "either-config": string }>({
            context: { role: "user" },
            required: ["either-config"],
          })
        );
        expect(client3.get("either-config")).toBe("default");
        client3.close();
      });

      it("should allow per-request context override", async () => {
        await ctx.createConfig("dynamic-config", "default", {
          overrides: [
            {
              name: "feature-override",
              conditions: [{ operator: "equals", property: "feature", value: literal("enabled") }],
              value: "feature-on",
            },
          ],
        });

        const client = trackClient(
          await ctx.createClient<{ "dynamic-config": string }>({ required: ["dynamic-config"] })
        );

        // Without context
        expect(client.get("dynamic-config")).toBe("default");

        // With per-request context
        expect(client.get("dynamic-config", { context: { feature: "enabled" } })).toBe(
          "feature-on"
        );

        // Original still returns default
        expect(client.get("dynamic-config")).toBe("default");

        client.close();
      });

      it("should apply first matching override", async () => {
        await ctx.createConfig("priority-config", "default", {
          overrides: [
            {
              name: "gold-override",
              conditions: [{ operator: "equals", property: "tier", value: literal("gold") }],
              value: "gold-value",
            },
            {
              name: "silver-override",
              conditions: [{ operator: "equals", property: "tier", value: literal("silver") }],
              value: "silver-value",
            },
            {
              name: "score-override",
              conditions: [{ operator: "greater_than", property: "score", value: literal(0) }],
              value: "has-score",
            },
          ],
        });

        // First override matches
        const client = trackClient(
          await ctx.createClient<{ "priority-config": string }>({
            context: { tier: "gold", score: 100 },
            required: ["priority-config"],
          })
        );
        expect(client.get("priority-config")).toBe("gold-value");
        client.close();
      });
    });

    // ==================== SNAPSHOT TESTS ====================

    describe("Snapshot", () => {
      it("should create snapshot with current configs", async () => {
        await ctx.createConfig("snap-config-1", "value-1");
        await ctx.createConfig("snap-config-2", "value-2");

        const client = trackClient(
          await ctx.createClient<{ "snap-config-1": string; "snap-config-2": string }>({
            required: ["snap-config-1", "snap-config-2"],
          })
        );

        const snapshot = client.getSnapshot();

        expect(snapshot.configs).toMatchInlineSnapshot(`
          [
            {
              "name": "snap-config-1",
              "overrides": [],
              "value": "value-1",
            },
            {
              "name": "snap-config-2",
              "overrides": [],
              "value": "value-2",
            },
          ]
        `);
        expect(snapshot.configs.map((c) => c.name).sort()).toEqual([
          "snap-config-1",
          "snap-config-2",
        ]);

        client.close();
      });

      it("should include context in snapshot", async () => {
        await ctx.createConfig("ctx-config", "value");

        const client = trackClient(
          await ctx.createClient<{ "ctx-config": string }>({
            context: { userId: "123" },
            required: ["ctx-config"],
          })
        );

        const snapshot = client.getSnapshot();
        expect(snapshot.context).toEqual({ userId: "123" });

        client.close();
      });
    });

    // ==================== ERROR HANDLING TESTS ====================

    describe("Error Handling", () => {
      it("should throw on invalid SDK key", async () => {
        await expect(
          createReplaneClient({
            sdkKey: "invalid-key",
            baseUrl: edgeApiBaseUrl,
            logger: silentLogger,
            initializationTimeoutMs: 2000,
          })
        ).rejects.toThrow();
      });

      it("should handle closed client gracefully", async () => {
        await ctx.createConfig("close-test", "value");

        const client = trackClient(
          await ctx.createClient<{ "close-test": string }>({ required: ["close-test"] })
        );

        expect(client.get("close-test")).toBe("value");

        client.close();

        // After close, client should still return cached value (doesn't throw)
        // This verifies the client handles close gracefully
        const cachedValue = client.get("close-test");
        expect(cachedValue).toBe("value");
      });

      it("should timeout on unreachable server", async () => {
        await expect(
          createReplaneClient({
            sdkKey: "rp_test",
            baseUrl: "http://localhost:59999", // Non-existent port
            logger: silentLogger,
            initializationTimeoutMs: 1000,
          })
        ).rejects.toThrow();
      });
    });

    // ==================== CONFIG LIFECYCLE TESTS ====================

    describe("Config Lifecycle", () => {
      it("should handle config creation after client connects", async () => {
        // Create client first with no configs
        const client = trackClient(
          await ctx.createClient({ defaults: { "late-config": "waiting" } })
        );

        // Set up signal to wait for the config
        const configSignal = createSignal<string>();
        client.subscribe("late-config", (config) => {
          configSignal.trigger(config.value as string);
        });

        // Create config after connection
        await ctx.createConfig("late-config", "late-value");

        // Wait for the config to appear via subscription
        const value = await configSignal.wait({ timeout: defaultTimeout });
        expect(value).toBe("late-value");

        expect(client.get("late-config")).toBe("late-value");

        client.close();
      });

      it("should ignore config deletion on client", async () => {
        await ctx.createConfig("delete-me", "exists");

        const client = trackClient(
          await ctx.createClient<{ "delete-me": string }>({ required: ["delete-me"] })
        );

        expect(client.get("delete-me")).toBe("exists");

        // Delete config
        await ctx.deleteConfig("delete-me");

        await delay(1000);

        expect(client.get("delete-me")).toBe("exists");

        client.close();
      });
    });

    // ==================== CONCURRENT CLIENTS TESTS ====================

    describe("Concurrent Clients", () => {
      it("should handle multiple clients with same SDK key", async () => {
        await ctx.createConfig("shared-config", "initial");

        const client1 = trackClient(
          await ctx.createClient<{ "shared-config": string }>({ required: ["shared-config"] })
        );
        const client2 = trackClient(
          await ctx.createClient<{ "shared-config": string }>({ required: ["shared-config"] })
        );

        expect(client1.get("shared-config")).toBe("initial");
        expect(client2.get("shared-config")).toBe("initial");

        // Both should receive updates
        const signal1 = createSignal<string>();
        const signal2 = createSignal<string>();

        client1.subscribe("shared-config", (c) => {
          if (c.value === "updated") signal1.trigger(c.value as string);
        });
        client2.subscribe("shared-config", (c) => {
          if (c.value === "updated") signal2.trigger(c.value as string);
        });

        await ctx.updateConfig("shared-config", "updated");

        const [v1, v2] = await Promise.all([
          signal1.wait({ timeout: defaultTimeout }),
          signal2.wait({ timeout: defaultTimeout }),
        ]);

        expect(v1).toBe("updated");
        expect(v2).toBe("updated");

        client1.close();
        client2.close();
      });

      it("should isolate context between clients", async () => {
        await ctx.createConfig("context-config", "default", {
          overrides: [
            {
              name: "prod-override",
              conditions: [{ operator: "equals", property: "env", value: literal("prod") }],
              value: "prod-value",
            },
          ],
        });

        const client1 = trackClient(
          await ctx.createClient<{ "context-config": string }>({
            context: { env: "prod" },
            required: ["context-config"],
          })
        );
        const client2 = trackClient(
          await ctx.createClient<{ "context-config": string }>({
            context: { env: "dev" },
            required: ["context-config"],
          })
        );

        expect(client1.get("context-config")).toBe("prod-value");
        expect(client2.get("context-config")).toBe("default");

        client1.close();
        client2.close();
      });
    });
  });
}
