import { Replane } from "@replanejs/sdk";

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

// DOM elements
const statusEl = document.getElementById("status")!;
const appEl = document.getElementById("app")!;

// Update log for real-time changes
const updateLog: string[] = [];

function log(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  updateLog.push(`[${timestamp}] ${message}`);
  if (updateLog.length > 50) updateLog.shift();
  renderUpdates();
}

function setStatus(status: "loading" | "connected" | "error", message: string) {
  statusEl.className = `status ${status}`;
  statusEl.textContent = message;
}

function renderConfig(replane: Replane<Configs>) {
  const maintenanceMode = replane.get("maintenance-mode");
  const featureFlags = replane.get("feature-flags");
  const rateLimits = replane.get("rate-limits");

  // Get config with context override
  const premiumFeatures = replane.get("feature-flags", {
    context: { plan: "premium" },
  });

  appEl.innerHTML = `
    <div class="config-section">
      <h2>Maintenance Mode</h2>
      <div class="config-card">
        <pre>${JSON.stringify(maintenanceMode, null, 2)}</pre>
      </div>
    </div>

    <div class="config-section">
      <h2>Feature Flags</h2>
      <div class="config-card">
        <pre>${JSON.stringify(featureFlags, null, 2)}</pre>
      </div>
    </div>

    <div class="config-section">
      <h2>Rate Limits</h2>
      <div class="config-card">
        <pre>${JSON.stringify(rateLimits, null, 2)}</pre>
      </div>
    </div>

    <div class="config-section">
      <h2>Feature Flags (Premium Context)</h2>
      <div class="config-card">
        <pre>${JSON.stringify(premiumFeatures, null, 2)}</pre>
      </div>
    </div>

    <div class="updates">
      <h2>Real-time Updates</h2>
      <div class="updates-log" id="updates-log"></div>
    </div>
  `;

  renderUpdates();
}

function renderUpdates() {
  const logEl = document.getElementById("updates-log");
  if (logEl) {
    logEl.innerHTML = updateLog.map((msg) => `<div>${msg}</div>`).join("");
    logEl.scrollTop = logEl.scrollHeight;
  }
}

async function main() {
  const sdkKey = import.meta.env.VITE_REPLANE_SDK_KEY || "demo-sdk-key";
  const baseUrl = import.meta.env.VITE_REPLANE_BASE_URL || "https://replane.example.com";

  try {
    let replane: Replane<Configs>;

    // Use in-memory client for demo if no real credentials
    if (sdkKey === "demo-sdk-key") {
      setStatus("connected", "Connected (Demo Mode - using in-memory defaults)");
      replane = new Replane<Configs>({
        defaults: {
          "maintenance-mode": false,
          "feature-flags": {
            newDashboard: true,
            betaFeatures: false,
            experimentalApi: false,
          },
          "rate-limits": {
            requestsPerMinute: 100,
            maxConnections: 20,
          },
        },
      });
    } else {
      setStatus("loading", "Connecting to Replane...");
      replane = new Replane<Configs>({
        context: {
          environment: "browser",
        },
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
      await replane.connect({ sdkKey, baseUrl });
      setStatus("connected", "Connected to Replane");
    }

    // Render initial config
    renderConfig(replane);

    // Subscribe to specific configs
    replane.subscribe("feature-flags", (config) => {
      log(`Config "${config.name}" updated`);
      renderConfig(replane);
    });

    replane.subscribe("rate-limits", (config) => {
      log(`Config "${config.name}" updated`);
      renderConfig(replane);
    });

    replane.subscribe("maintenance-mode", (config) => {
      log(`Config "${config.name}" updated`);
      renderConfig(replane);
    });

    log("Subscribed to config updates");

    // Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      replane.disconnect();
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setStatus("error", `Error: ${message}`);
    appEl.innerHTML = `
      <div class="config-card">
        <p>Failed to connect to Replane. Make sure you have set the correct environment variables:</p>
        <pre>VITE_REPLANE_SDK_KEY=your-sdk-key
VITE_REPLANE_BASE_URL=https://replane.example.com</pre>
      </div>
    `;
  }
}

main();
