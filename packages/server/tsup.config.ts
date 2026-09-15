import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/express.ts", "src/hono.ts", "src/next.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node20",
  external: ["express", "hono", "@pulsar/core"],
});
