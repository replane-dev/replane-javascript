import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getReplaneSnapshot, clearSnapshotCache } from "../src/snapshot";
import { MockReplaneServerController } from "./utils";

function sync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSilentLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("getReplaneSnapshot", () => {
  let mockServer: MockReplaneServerController;
  let silentLogger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    mockServer = new MockReplaneServerController();
    silentLogger = createSilentLogger();
  });

  afterEach(async () => {
    await clearSnapshotCache();
    mockServer.close();
  });

  function getSnapshot<T extends object = Record<string, unknown>>(
    options: Partial<Parameters<typeof getReplaneSnapshot<T>>[0]> = {}
  ) {
    return getReplaneSnapshot<T>({
      sdkKey: "test-sdk-key",
      baseUrl: "https://replane.my-host.com",
      fetchFn: mockServer.fetchFn,
      logger: silentLogger,
      ...options,
    });
  }

  describe("basic functionality", () => {
    it("should return a snapshot with configs", async () => {
      const snapshotPromise = getSnapshot();

      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [
          { name: "feature", overrides: [], value: { enabled: true } },
          { name: "theme", overrides: [], value: "dark" },
        ],
      });

      const snapshot = await snapshotPromise;
      await sync();

      expect(snapshot.configs).toBeDefined();
      expect(snapshot.configs).toHaveLength(2);
      expect(snapshot.configs.find((c) => c.name === "feature")?.value).toEqual({ enabled: true });
      expect(snapshot.configs.find((c) => c.name === "theme")?.value).toBe("dark");
    });

  });

  describe("caching behavior", () => {
    it("should reuse cached client for same options", async () => {
      // First call
      const snapshot1Promise = getSnapshot();
      const connection1 = await mockServer.acceptConnection();
      await connection1.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "value1" }],
      });
      await snapshot1Promise;
      await sync();

      // Second call with same options - should reuse cached client
      const snapshot2Promise = getSnapshot();
      // No new connection should be accepted since client is cached
      const snapshot2 = await snapshot2Promise;
      await sync();

      expect(snapshot2.configs).toHaveLength(1);
      expect(snapshot2.configs[0].value).toBe("value1");
    });

    it("should create new client for different sdkKey", async () => {
      // First call
      const snapshot1Promise = getSnapshot({ sdkKey: "key-1" });
      const connection1 = await mockServer.acceptConnection();
      await connection1.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "from-key-1" }],
      });
      await snapshot1Promise;
      await sync();

      // Second call with different sdkKey
      const snapshot2Promise = getSnapshot({ sdkKey: "key-2" });
      const connection2 = await mockServer.acceptConnection();
      await connection2.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "from-key-2" }],
      });
      const snapshot2 = await snapshot2Promise;
      await sync();

      expect(snapshot2.configs[0].value).toBe("from-key-2");
    });

    it("should create new client for different baseUrl", async () => {
      // First call
      const snapshot1Promise = getSnapshot({ baseUrl: "https://host1.com" });
      const connection1 = await mockServer.acceptConnection();
      await connection1.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "from-host-1" }],
      });
      await snapshot1Promise;
      await sync();

      // Second call with different baseUrl
      const snapshot2Promise = getSnapshot({ baseUrl: "https://host2.com" });
      const connection2 = await mockServer.acceptConnection();
      await connection2.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "from-host-2" }],
      });
      const snapshot2 = await snapshot2Promise;
      await sync();

      expect(snapshot2.configs[0].value).toBe("from-host-2");
    });

    it("should expire cache after TTL", async () => {
      const keepAliveMs = 100; // Use short TTL for test

      // First call
      const snapshot1Promise = getSnapshot({ keepAliveMs });
      const connection1 = await mockServer.acceptConnection();
      await connection1.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "value1" }],
      });
      await snapshot1Promise;
      await sync();

      // Wait for TTL to expire
      await delay(keepAliveMs + 50);

      // Second call - should create new client since cache expired
      const snapshot2Promise = getSnapshot({ keepAliveMs });
      const connection2 = await mockServer.acceptConnection();
      await connection2.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "value2" }],
      });
      const snapshot2 = await snapshot2Promise;
      await sync();

      expect(snapshot2.configs[0].value).toBe("value2");
    });
  });

  describe("clearSnapshotCache", () => {
    it("should clear all cached clients", async () => {
      // Create multiple cached clients
      const snapshot1Promise = getSnapshot({ sdkKey: "key-1" });
      const connection1 = await mockServer.acceptConnection();
      await connection1.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "value1" }],
      });
      await snapshot1Promise;
      await sync();

      const snapshot2Promise = getSnapshot({ sdkKey: "key-2" });
      const connection2 = await mockServer.acceptConnection();
      await connection2.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "value2" }],
      });
      await snapshot2Promise;
      await sync();

      // Clear cache
      await clearSnapshotCache();

      // New calls should create new clients
      const snapshot3Promise = getSnapshot({ sdkKey: "key-1" });
      const connection3 = await mockServer.acceptConnection();
      await connection3.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "value3" }],
      });
      const snapshot3 = await snapshot3Promise;
      await sync();

      expect(snapshot3.configs[0].value).toBe("value3");
    });
  });

  describe("concurrent requests", () => {
    it("should share the same client promise for concurrent requests", async () => {
      // Start two requests concurrently
      const snapshot1Promise = getSnapshot();
      const snapshot2Promise = getSnapshot();

      // Only one connection should be made
      const connection = await mockServer.acceptConnection();
      await connection.push({
        type: "init",
        configs: [{ name: "config1", overrides: [], value: "shared-value" }],
      });

      const [snapshot1, snapshot2] = await Promise.all([snapshot1Promise, snapshot2Promise]);
      await sync();

      expect(snapshot1.configs[0].value).toBe("shared-value");
      expect(snapshot2.configs[0].value).toBe("shared-value");
    });
  });
});
