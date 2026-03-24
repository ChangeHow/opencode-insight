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
