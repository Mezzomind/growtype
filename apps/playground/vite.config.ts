import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
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
