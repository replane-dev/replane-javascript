<script lang="ts">
  import { useConfig } from "@replanejs/svelte";
  import NewHeader from "./NewHeader.svelte";
  import OldHeader from "./OldHeader.svelte";
  import ConfigDisplay from "./ConfigDisplay.svelte";

  interface ThemeConfig {
    primaryColor: string;
    darkMode: boolean;
  }

  interface FeatureFlags {
    newHeader: boolean;
    showBanner: boolean;
    experimentalFeatures: boolean;
  }

  // useConfig returns a Svelte store - use $ prefix for auto-subscription
  const theme = useConfig<ThemeConfig>("theme-config");
  const features = useConfig<FeatureFlags>("feature-flags");
  const bannerMessage = useConfig<string>("banner-message");
</script>

<div
  class="app"
  style="background-color: {$theme.darkMode ? '#1f2937' : '#ffffff'}; color: {$theme.darkMode ? '#f9fafb' : '#111827'};"
>
  {#if $features.newHeader}
    <NewHeader primaryColor={$theme.primaryColor} />
  {:else}
    <OldHeader />
  {/if}

  {#if $features.showBanner}
    <div class="banner" style="background-color: {$theme.primaryColor}">
      {$bannerMessage}
    </div>
  {/if}

  <main class="content">
    <h1>Replane Svelte Example</h1>
    <p>
      This example demonstrates how to use <code>@replanejs/svelte</code> for dynamic
      configuration with real-time updates.
    </p>

    <ConfigDisplay />

    {#if $features.experimentalFeatures}
      <div class="experimental">
        <h2>Experimental Features</h2>
        <p>You have access to experimental features!</p>
      </div>
    {/if}
  </main>
</div>
