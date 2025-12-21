import { defineConfig } from "vite";

export default defineConfig({
  // Define environment variables that will be replaced at build time
  define: {
    "import.meta.env.VITE_REPLANE_SDK_KEY": JSON.stringify(
      process.env.VITE_REPLANE_SDK_KEY || "demo-sdk-key"
    ),
    "import.meta.env.VITE_REPLANE_BASE_URL": JSON.stringify(
      process.env.VITE_REPLANE_BASE_URL || "https://replane.example.com"
    ),
  },
});
