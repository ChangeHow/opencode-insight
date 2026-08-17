import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.WEB_PORT ?? 3000);
const bffPort = Number(process.env.PORT ?? 8787);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // agent-prism data: vendored from the same repo HEAD as the UI components
      "@evilmartians/agent-prism-data": path.resolve(
        __dirname,
        "./src/lib/agent-prism-data/index.ts",
      ),
    },
  },
  server: {
    host,
    port,
    strictPort: true,
    proxy: {
      "/api": `http://localhost:${bffPort}`,
    },
  },
  preview: {
    host,
    port,
    strictPort: true,
  },
});
