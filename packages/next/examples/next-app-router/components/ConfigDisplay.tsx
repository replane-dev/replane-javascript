"use client";

import { useAppConfig, useAppReplane } from "@/replane/hooks";

export function ConfigDisplay() {
  // Use the typed hook - config names autocomplete and values are fully typed
  const theme = useAppConfig("theme");
  const features = useAppConfig("features");

  // Alternative: use the client directly for more control
  // const replane = useAppReplane();
  // const theme = replane.get("theme");
  // const allConfigs = replane.getSnapshot().configs;

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
      <pre>{JSON.stringify(theme, null, 2)}</pre>

      <h3 style={{ marginTop: "1rem" }}>Features Config</h3>
      <pre>{JSON.stringify(features, null, 2)}</pre>

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
