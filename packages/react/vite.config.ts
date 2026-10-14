import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: { resolveDepSubpath: true },
    dts: { generator: "tsgo" },
    exports: true,
  },
  resolve: {
    // Test against the core source, so no core build is needed first.
    alias: {
      "@growtype/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
});
