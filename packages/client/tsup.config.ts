import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node20",
  external: ["@pulsar/core", "@stellar/stellar-sdk"],
});
