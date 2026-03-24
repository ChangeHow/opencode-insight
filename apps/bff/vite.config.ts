import { defineConfig } from "vite";
import devServer from "@hono/vite-dev-server";
import nodeAdapter from "@hono/vite-dev-server/node";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 8787,
    strictPort: true,
  },
  plugins: [
    devServer({
      adapter: nodeAdapter,
      entry: "./src/app.ts",
      injectClientScript: false,
    }),
  ],
});
