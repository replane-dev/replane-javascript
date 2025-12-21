import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["./src/index.tsx"],
    format: ["esm", "cjs"],
    platform: "neutral",
    dts: true,
    external: ["react", "react-dom", "next", "@replanejs/sdk", "@replanejs/react"],
  },
  {
    entry: ["./src/server.tsx"],
    format: ["esm", "cjs"],
    platform: "neutral",
    dts: true,
    external: ["react", "react-dom", "next", "@replanejs/sdk", "@replanejs/react"],
  },
]);
