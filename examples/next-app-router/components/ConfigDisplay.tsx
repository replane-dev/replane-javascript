"use client";

import { createConfigHook } from "@replanejs/next";

// Define your config types
interface AppConfigs {
  theme: {
    darkMode: boolean;
    primaryColor: string;
  };
  features: {
    betaEnabled: boolean;
    maxItems: number;
  };
}

// Create typed hooks for better DX
const useAppConfig = createConfigHook<AppConfigs>();

export function ConfigDisplay() {
  const theme = useAppConfig("theme");
  const features = useAppConfig("features");

  return (
    <div
      style={{
        padding: "1rem",
        border: "1px solid #ccc",
        borderRadius: "8px",
        backgroundColor: theme.darkMode ? "#1a1a1a" : "#ffffff",
        color: theme.darkMode ? "#ffffff" : "#000000",
      }}
    >
      <h3 style={{ color: theme.primaryColor }}>Theme Config</h3>
      <pre>
        {JSON.stringify(theme, null, 2)}
      </pre>

      <h3 style={{ marginTop: "1rem" }}>Features Config</h3>
      <pre>
        {JSON.stringify(features, null, 2)}
      </pre>

      {features.betaEnabled && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.5rem",
            backgroundColor: "#ffeb3b",
            color: "#000",
            borderRadius: "4px",
          }}
        >
          Beta features are enabled!
        </div>
      )}
    </div>
  );
}
