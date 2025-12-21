import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ReplaneProvider } from "@replanejs/react";
import App from "./App";
import "./index.css";

// Config types for type-safe access
declare module "@replanejs/react" {
  interface Configs {
    "theme-config": ThemeConfig;
    "feature-flags": FeatureFlags;
    "banner-message": string;
  }
}

interface ThemeConfig {
  primaryColor: string;
  darkMode: boolean;
}

interface FeatureFlags {
  newHeader: boolean;
  showBanner: boolean;
  experimentalFeatures: boolean;
}

// Environment variables (in a real app, use import.meta.env)
const sdkKey = import.meta.env.VITE_REPLANE_SDK_KEY || "demo-sdk-key";
const baseUrl =
  import.meta.env.VITE_REPLANE_BASE_URL || "https://replane.example.com";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<LoadingScreen />}>
      <ReplaneProvider
        options={{
          sdkKey,
          baseUrl,
          fallbacks: {
            "theme-config": { primaryColor: "#3b82f6", darkMode: false },
            "feature-flags": {
              newHeader: true,
              showBanner: true,
              experimentalFeatures: false,
            },
            "banner-message": "Welcome to the Replane React Example!",
          },
        }}
        suspense
      >
        <App />
      </ReplaneProvider>
    </Suspense>
  </StrictMode>
);

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      <p>Loading configuration...</p>
    </div>
  );
}
