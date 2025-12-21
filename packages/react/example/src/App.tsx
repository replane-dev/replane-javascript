import { createReplaneHook, createConfigHook, useConfig } from "@replanejs/react";
import type { AppConfigs, FeatureFlags } from "./configs";

// ============================================================================
// Create Type-Safe Hooks
// ============================================================================

// createReplaneHook returns a typed version of useReplane (returns replane instance directly)
// This provides typed access to the replane instance
const useAppReplane = createReplaneHook<AppConfigs>();

// createConfigHook returns a typed version of useConfig
// This provides autocomplete for config names and type inference for values
const useAppConfig = createConfigHook<AppConfigs>();

// ============================================================================
// App Component
// ============================================================================

function App() {
  // useAppConfig automatically infers the correct return type based on the config name
  // e.g., theme is typed as ThemeConfig, features as FeatureFlags
  const theme = useAppConfig("theme-config");
  const bannerMessage = useAppConfig("banner-message");

  // alternatively, use the useConfig hook directly
  const features = useConfig<FeatureFlags>("feature-flags");

  return (
    <div
      className="app"
      style={{
        backgroundColor: theme.darkMode ? "#1f2937" : "#ffffff",
        color: theme.darkMode ? "#f9fafb" : "#111827",
      }}
    >
      {features.newHeader ? <NewHeader primaryColor={theme.primaryColor} /> : <OldHeader />}

      {features.showBanner && (
        <div className="banner" style={{ backgroundColor: theme.primaryColor }}>
          {bannerMessage}
        </div>
      )}

      <main className="content">
        <h1>Replane React Example</h1>
        <p>
          This example demonstrates how to use <code>@replanejs/react</code> for dynamic
          configuration with real-time updates and type-safe access via{" "}
          <code>createReplaneHook</code> and <code>createConfigHook</code>.
        </p>

        <ConfigDisplay />

        {features.experimentalFeatures && (
          <div className="experimental">
            <h2>Experimental Features</h2>
            <p>You have access to experimental features!</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Header Components
// ============================================================================

function NewHeader({ primaryColor }: { primaryColor: string }) {
  return (
    <header className="header new-header" style={{ borderBottomColor: primaryColor }}>
      <h1 style={{ color: primaryColor }}>Replane Demo (New Header)</h1>
      <nav>
        <a href="#">Home</a>
        <a href="#">Features</a>
        <a href="#">Docs</a>
      </nav>
    </header>
  );
}

function OldHeader() {
  return (
    <header className="header old-header">
      <h1>Replane Demo</h1>
    </header>
  );
}

// ============================================================================
// Config Display Component
// ============================================================================

function ConfigDisplay() {
  // useAppReplane returns the replane instance directly (no destructuring needed)
  const replane = useAppReplane();

  // alternatively, use the useReplane hook directly
  // const replane = useReplane();

  // Type-safe config access with autocomplete
  const theme = useAppConfig("theme-config");
  const features = useAppConfig("feature-flags");

  // alternatively, use the useConfig hook directly
  // const theme = useConfig<ThemeConfig>("theme-config");
  // const features = useConfig<FeatureFlags>("feature-flags");

  return (
    <section className="config-display">
      <h2>Current Configuration</h2>
      <p className="hint">Changes to these values in Replane will update in real-time via SSE.</p>

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
        <h3>Type-Safe Hook Factories</h3>
        <p>
          Use <code>createReplaneHook</code> and <code>createConfigHook</code> to create typed
          versions of the hooks:
        </p>
        <pre>
          {`// Define your config types
interface AppConfigs {
  "theme-config": ThemeConfig;
  "feature-flags": FeatureFlags;
  "banner-message": string;
}

// Create typed hooks
const useAppReplane = createReplaneHook<AppConfigs>();
const useAppConfig = createConfigHook<AppConfigs>();

// Use with full type safety and autocomplete
function MyComponent() {
  // Replane instance returned directly (no destructuring)
  const replane = useAppReplane();
  //    ^? ReplaneClient<AppConfigs>

  // Typed config values
  const theme = useAppConfig("theme-config");
  //    ^? ThemeConfig

  const features = useAppConfig("feature-flags");
  //    ^? FeatureFlags
}`}
        </pre>
      </div>

      <div className="config-card">
        <h3>With Context Override</h3>
        <p>You can pass context for user-specific evaluation:</p>
        <pre>
          {`// With context for targeting
const premiumFeatures = useAppConfig("feature-flags", {
  context: { userId: "123", plan: "premium" }
});

// Or access directly from typed replane instance
const replane = useAppReplane();
const value = replane.get("feature-flags", {
  context: { plan: "premium" }
});`}
        </pre>
        <p>Current value with premium context:</p>
        <pre>
          {JSON.stringify(replane.get("feature-flags", { context: { plan: "premium" } }), null, 2)}
        </pre>
      </div>

      <div className="config-card">
        <h3>Replane Snapshot</h3>
        <p>Access all configs at once via getSnapshot:</p>
        <pre>{JSON.stringify(replane.getSnapshot(), null, 2)}</pre>
      </div>
    </section>
  );
}

export default App;
