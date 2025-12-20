"use client";

import { useConfig, useReplane } from "@replanejs/next";

interface ThemeConfig {
  primaryColor: string;
  darkMode: boolean;
}

interface FeatureFlags {
  newNavigation: boolean;
  showFooter: boolean;
  experimentalFeatures: boolean;
}

export function FeatureShowcase() {
  const { client } = useReplane();
  const theme = useConfig<ThemeConfig>("theme-config");
  const features = useConfig<FeatureFlags>("feature-flags");

  return (
    <section className="feature-showcase">
      <h2>Live Configuration</h2>
      <p className="hint">
        These values update in real-time when changed in Replane. No page refresh
        needed!
      </p>

      <div className="config-grid">
        <div className="config-card">
          <h3>Theme Config</h3>
          <pre>{JSON.stringify(theme, null, 2)}</pre>
        </div>

        <div className="config-card">
          <h3>Feature Flags</h3>
          <pre>{JSON.stringify(features, null, 2)}</pre>
        </div>
      </div>

      <div className="config-card">
        <h3>Context-Based Evaluation</h3>
        <p style={{ marginBottom: "0.5rem", fontSize: "0.875rem" }}>
          Pass context to get user-specific config values:
        </p>
        <pre>
          {`// Get features for a premium user
const premiumFeatures = client.get("feature-flags", {
  context: { userId: "123", plan: "premium" }
});`}
        </pre>
      </div>

      {features.experimentalFeatures && (
        <div className="experimental-banner">
          <h3>Experimental Features Enabled</h3>
          <p>You have access to experimental features!</p>
        </div>
      )}
    </section>
  );
}
