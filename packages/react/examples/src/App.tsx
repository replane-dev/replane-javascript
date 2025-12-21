import { useReplane, createConfigHook } from "@replanejs/react";

// ============================================================================
// Type Definitions
// ============================================================================

// Define your configuration types
interface ThemeConfig {
  primaryColor: string;
  darkMode: boolean;
}

interface FeatureFlags {
  newHeader: boolean;
  showBanner: boolean;
  experimentalFeatures: boolean;
}

// Define all your configs in one interface for type-safe access
interface AppConfigs {
  "theme-config": ThemeConfig;
  "feature-flags": FeatureFlags;
  "banner-message": string;
}

// ============================================================================
// Create Type-Safe Config Hook
// ============================================================================

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
  const features = useAppConfig("feature-flags");
  const bannerMessage = useAppConfig("banner-message");

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
          <code>createConfigHook</code>.
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
  const { client } = useReplane<AppConfigs>();

  // Type-safe config access with autocomplete
  const theme = useAppConfig("theme-config");
  const features = useAppConfig("feature-flags");

  return (
    <section className="config-display">
      <h2>Current Configuration</h2>
      <p className="hint">
        Changes to these values in Replane will update in real-time via SSE.
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
        <h3>Type-Safe Hook Usage</h3>
        <p>
          The <code>createConfigHook</code> function creates a typed version of{" "}
          <code>useConfig</code>:
        </p>
        <pre>
          {`// Define your config types
interface AppConfigs {
  "theme-config": ThemeConfig;
  "feature-flags": FeatureFlags;
  "banner-message": string;
}

// Create the typed hook
const useAppConfig = createConfigHook<AppConfigs>();

// Use with full type safety and autocomplete
const theme = useAppConfig("theme-config");
//    ^? ThemeConfig

const features = useAppConfig("feature-flags");
//    ^? FeatureFlags`}
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

// Or access directly from client
const value = client.get("feature-flags", {
  context: { plan: "premium" }
});`}
        </pre>
        <p>Current value with premium context:</p>
        <pre>
          {JSON.stringify(
            client.get("feature-flags", { context: { plan: "premium" } }),
            null,
            2
          )}
        </pre>
      </div>
    </section>
  );
}

export default App;
