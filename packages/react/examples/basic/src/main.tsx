import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ReplaneProvider } from "@replanejs/react";
import App from "./App";
import "./index.css";
import type { AppConfigs } from "./configs";

// Environment variables (in a real app, use import.meta.env)
const sdkKey = import.meta.env.VITE_REPLANE_SDK_KEY || "demo-sdk-key";
const baseUrl = import.meta.env.VITE_REPLANE_BASE_URL || "https://app.replane.dev";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<LoadingScreen />}>
      <ReplaneProvider<AppConfigs>
        connection={{
          sdkKey,
          baseUrl,
        }}
        defaults={{
          "theme-config": { primaryColor: "#3b82f6", darkMode: false },
          "feature-flags": {
            newHeader: true,
            showBanner: true,
            experimentalFeatures: false,
          },
          "banner-message": "Welcome to the Replane React Example!",
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
