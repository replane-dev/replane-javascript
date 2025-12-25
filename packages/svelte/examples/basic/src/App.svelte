<script lang="ts">
  import { ReplaneContext, createInMemoryReplaneClient } from "@replanejs/svelte";
  import MainContent from "./lib/MainContent.svelte";

  // Environment variables
  const sdkKey = import.meta.env.VITE_REPLANE_SDK_KEY || "demo-sdk-key";
  const baseUrl = import.meta.env.VITE_REPLANE_BASE_URL || "https://replane.example.com";

  // Demo mode: use in-memory client
  // Production mode: use options prop for async client creation
  const isDemoMode = sdkKey === "demo-sdk-key";

  // For demo mode, create an in-memory client
  const demoClient = isDemoMode
    ? createInMemoryReplaneClient({
        configs: {
          "theme-config": { primaryColor: "#3b82f6", darkMode: false },
          "feature-flags": {
            newHeader: true,
            showBanner: true,
            experimentalFeatures: false,
          },
          "banner-message": "Welcome to the Replane Svelte Example!",
        },
      })
    : null;

  // For production mode, use options
  const options = !isDemoMode
    ? {
        sdkKey,
        baseUrl,
        defaults: {
          "theme-config": { primaryColor: "#3b82f6", darkMode: false },
          "feature-flags": {
            newHeader: true,
            showBanner: true,
            experimentalFeatures: false,
          },
          "banner-message": "Welcome to the Replane Svelte Example!",
        },
      }
    : null;
</script>

{#if isDemoMode && demoClient}
  <!-- Demo mode: use pre-created in-memory client -->
  <ReplaneContext client={demoClient}>
    <MainContent />
  </ReplaneContext>
{:else if options}
  <!-- Production mode: use options with async client creation -->
  <svelte:boundary>
    <ReplaneContext {options}>
      <MainContent />

      {#snippet loader()}
        <div class="loading-screen">
          <div class="spinner"></div>
          <p>Loading configuration...</p>
        </div>
      {/snippet}
    </ReplaneContext>

    {#snippet failed(error)}
      <div class="loading-screen">
        <p>Error loading configuration: {error.message}</p>
      </div>
    {/snippet}
  </svelte:boundary>
{/if}
