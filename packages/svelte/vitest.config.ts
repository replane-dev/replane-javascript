import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    conditions: ["browser"],
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.spec.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    alias: {
      // Force browser version of Svelte in tests
      svelte: "svelte",
    },
  },
});
