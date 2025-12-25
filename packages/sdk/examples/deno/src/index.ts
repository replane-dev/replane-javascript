import { createReplaneClient } from "@replanejs/sdk";

// Define your config types for type-safe access
interface Configs {
  "feature-flags": FeatureFlags;
  "rate-limits": RateLimits;
  "maintenance-mode": boolean;
}

interface FeatureFlags {
  newDashboard: boolean;
  betaFeatures: boolean;
  experimentalApi: boolean;
}

interface RateLimits {
  requestsPerMinute: number;
  maxConnections: number;
}

async function main() {
  // Ensure required environment variables are set
  const sdkKey = Deno.env.get("REPLANE_SDK_KEY");
  const baseUrl = Deno.env.get("REPLANE_BASE_URL");

  if (!sdkKey || !baseUrl) {
    console.error("Missing required environment variables:");
    console.error("  REPLANE_SDK_KEY - Your Replane SDK key");
    console.error("  REPLANE_BASE_URL - Your Replane API base URL");
    console.error("\nExample:");
    console.error(
      "  REPLANE_SDK_KEY=your-key REPLANE_BASE_URL=https://replane.example.com deno task start"
    );
    Deno.exit(1);
  }

  console.log("Connecting to Replane...");

  // Create the Replane client with type-safe config access
  const replane = await createReplaneClient<Configs>({
    sdkKey,
    baseUrl,
    // Optional: set default context for all config evaluations
    context: {
      environment: "development",
    },
    // Optional: default values if initial fetch fails
    defaults: {
      "maintenance-mode": false,
      "feature-flags": {
        newDashboard: false,
        betaFeatures: false,
        experimentalApi: false,
      },
      "rate-limits": {
        requestsPerMinute: 60,
        maxConnections: 10,
      },
    },
  });

  console.log("Connected to Replane!\n");

  // Get config values (type-safe)
  const maintenanceMode = replane.get("maintenance-mode");
  console.log("Maintenance mode:", maintenanceMode);

  const featureFlags = replane.get("feature-flags");
  console.log("Feature flags:", featureFlags);

  const rateLimits = replane.get("rate-limits");
  console.log("Rate limits:", rateLimits);

  // Get config with context override for user-specific evaluation
  const userFeatures = replane.get("feature-flags", {
    context: {
      userId: "user-123",
      plan: "premium",
    },
  });
  console.log("\nFeature flags for premium user:", userFeatures);

  // Subscribe to config changes (real-time updates via SSE)
  console.log("\nSubscribing to config changes...");

  const unsubscribeAll = replane.subscribe((config) => {
    console.log(`[Update] Config "${config.name}" changed:`, config.value);
  });

  // Subscribe to a specific config
  const unsubscribeFeatures = replane.subscribe("feature-flags", (config) => {
    console.log("[Update] Feature flags changed:", config.value);
  });

  // Keep the process running to receive updates
  console.log("Listening for config updates. Press Ctrl+C to exit.\n");

  // Handle graceful shutdown
  Deno.addSignalListener("SIGINT", () => {
    console.log("\nShutting down...");
    unsubscribeAll();
    unsubscribeFeatures();
    replane.close();
    Deno.exit(0);
  });
}

main().catch((error) => {
  console.error("Error:", error.message);
  Deno.exit(1);
});
