<script lang="ts">
  import { useReplane, useConfig } from "@replanejs/svelte";

  interface ThemeConfig {
    primaryColor: string;
    darkMode: boolean;
  }

  interface FeatureFlags {
    newHeader: boolean;
    showBanner: boolean;
    experimentalFeatures: boolean;
  }

  const { client } = useReplane();
  const theme = useConfig<ThemeConfig>("theme-config");
  const features = useConfig<FeatureFlags>("feature-flags");

  // Get value with premium context override
  const premiumFeatures = $derived(
    client.get("feature-flags", { context: { plan: "premium" } })
  );
</script>

<section class="config-display">
  <h2>Current Configuration</h2>
  <p class="hint">
    Changes to these values in Replane will update in real-time via SSE.
  </p>

  <div class="config-grid">
    <div class="config-card">
      <h3>Theme Config</h3>
      <pre>{JSON.stringify($theme, null, 2)}</pre>
    </div>

    <div class="config-card">
      <h3>Feature Flags</h3>
      <pre>{JSON.stringify($features, null, 2)}</pre>
    </div>
  </div>

  <div class="config-card">
    <h3>With Context Override</h3>
    <p>You can pass context for user-specific evaluation:</p>
    <pre>{`const premiumFeatures = client.get("feature-flags", {
  context: { userId: "123", plan: "premium" }
});`}</pre>
    <p>Current value with premium context:</p>
    <pre>{JSON.stringify(premiumFeatures, null, 2)}</pre>
  </div>
</section>
