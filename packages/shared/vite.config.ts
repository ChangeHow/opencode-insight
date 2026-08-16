import { resolve } from "node:path";
import { defineConfig } from "vite";

// Type declarations are emitted by `tsc -p tsconfig.build.json` in the build
// script (tsgo). vite-plugin-dts relies on the TS5 programmatic API which
// tsgo does not provide.
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "dist",
    emptyOutDir: false,
  },
});
