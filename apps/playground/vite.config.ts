import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  // Served from a sub-path on GitHub Pages (e.g. /growtype/); root everywhere else.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    // Use the library source directly so edits hot-reload without a rebuild.
    alias: {
      "@growtype/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@growtype/react": fileURLToPath(
        new URL("../../packages/react/src/index.ts", import.meta.url),
      ),
    },
  },
});
