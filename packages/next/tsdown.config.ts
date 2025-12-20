import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  external: ["react", "next", "@replanejs/sdk", "@replanejs/react"],
});
