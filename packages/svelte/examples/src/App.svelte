<script lang="ts">
  import { createReplaneClient, createInMemoryReplaneClient } from "@replanejs/sdk";
  import { ReplaneProvider } from "@replanejs/svelte";
  import MainContent from "./lib/MainContent.svelte";

  // Environment variables
  const sdkKey = import.meta.env.VITE_REPLANE_SDK_KEY || "demo-sdk-key";
  const baseUrl = import.meta.env.VITE_REPLANE_BASE_URL || "https://replane.example.com";

  // Create client with fallbacks for demo
  // In production, use createReplaneClient with real credentials
  const clientPromise = sdkKey === "demo-sdk-key"
    ? Promise.resolve(
        createInMemoryReplaneClient({
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
      )
    : createReplaneClient({
        sdkKey,
        baseUrl,
        fallbacks: {
          "theme-config": { primaryColor: "#3b82f6", darkMode: false },
          "feature-flags": {
            newHeader: true,
            showBanner: true,
            experimentalFeatures: false,
          },
          "banner-message": "Welcome to the Replane Svelte Example!",
        },
      });

  let client = $state<Awaited<typeof clientPromise> | null>(null);
  let loading = $state(true);
  let error = $state<Error | null>(null);

  // Initialize client
  $effect(() => {
    clientPromise
      .then((c) => {
        client = c;
        loading = false;
      })
      .catch((e) => {
        error = e;
        loading = false;
      });
  });
</script>

{#if loading}
  <div class="loading-screen">
    <div class="spinner"></div>
    <p>Loading configuration...</p>
  </div>
{:else if error}
  <div class="loading-screen">
    <p>Error loading configuration: {error.message}</p>
  </div>
{:else if client}
  <ReplaneProvider {client}>
    <MainContent />
  </ReplaneProvider>
{/if}
